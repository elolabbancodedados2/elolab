import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, Eye, CheckCircle2, AlertCircle, Loader2, RefreshCw,
  Search, AlertTriangle, Clock, Download, Printer, Shield, XCircle,
  User, Filter, ChevronDown, ChevronUp, Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { notificarResultadoLiberado } from '@/lib/notificarResultado';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { gerarLaudoPDF, downloadLaudoPDF, LaudoData } from '@/lib/pdfGenerator';
import { canalUnico } from '@/lib/realtimeCanal';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { formatDateTimeSaoPaulo } from '@/lib/dateOnly';

/**
 * Teto da worklist do laboratório.
 *
 * O PostgREST corta em 1.000 linhas por padrão e não avisa. Pedimos um a mais
 * que este teto para detectar o corte e dizer ao operador que existe mais
 * histórico, em vez de deixá-lo achar que a amostra sumiu.
 */
const TETO_WORKLIST = 500;


const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const parseResultadoNumerico = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^[-+]?(?:\d[\d\s.,]*|\.\d+)/);
  if (!match) return null;
  const token = match[0].replace(/\s/g, '');
  const ultimaVirgula = token.lastIndexOf(',');
  const ultimoPonto = token.lastIndexOf('.');
  let normalizado = token;
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    normalizado = ultimaVirgula > ultimoPonto
      ? token.replace(/\./g, '').replace(',', '.')
      : token.replace(/,/g, '');
  } else if (ultimaVirgula >= 0) {
    normalizado = token.replace(/,/g, (_virgula, offset) => offset === ultimaVirgula ? '.' : '');
  }
  const parsed = Number(normalizado);
  return Number.isFinite(parsed) ? parsed : null;
};

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };
const fadeUp = { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

// ─── Laudo Detail Modal ────────────────────────────────────
function LaudoDetalheModal({ coletaId, onClose, onUpdate }: {
  coletaId: string | null; onClose: () => void; onUpdate: () => void;
}) {
  const { profile } = useSupabaseAuth();
  const [coleta, setColeta] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const fetchRequestRef = useRef(0);
  const [isValidating, setIsValidating] = useState(false);
  const [isReleasingAll, setIsReleasingAll] = useState(false);
  const [releasingIds, setReleasingIds] = useState<Set<string>>(new Set());
  const [observacaoLaudo, setObservacaoLaudo] = useState('');
  const isBusy = isValidating || isReleasingAll || releasingIds.size > 0;

  const fetchData = useCallback(async () => {
    const requestId = ++fetchRequestRef.current;
    if (!coletaId) {
      setColeta(null);
      setLoadError(null);
      setLoading(false);
      return;
    }
    if (!profile?.clinica_id) {
      setColeta(null);
      setLoadError(new Error('Clínica não identificada. Atualize a página e tente novamente.'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setColeta(null);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('coletas_laboratorio')
        .select(`
          id, codigo_amostra, status, created_at, data_coleta, observacoes, tipo_amostra, tubo, urgente,
          numero_guia, material,
          pacientes(nome, nome_social, cpf, telefone, email, data_nascimento, sexo),
          medicos(nome, crm),
          convenios(nome),
          resultados_laboratorio(id, parametro, resultado, unidade,
            valor_referencia_min, valor_referencia_max, valor_referencia_texto,
            liberado, data_liberacao, metodo, exames(tipo_exame))
        `)
        .eq('id', coletaId)
        .eq('clinica_id', profile.clinica_id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A coleta não foi encontrada ou não está acessível nesta clínica.');
      if (requestId !== fetchRequestRef.current) return;
      setColeta(data);
    } catch (error) {
      if (requestId === fetchRequestRef.current) setLoadError(error);
    } finally {
      if (requestId === fetchRequestRef.current) setLoading(false);
    }
  }, [coletaId, profile?.clinica_id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /**
   * O laudo só sai depois da conferência técnica.
   *
   * O pipeline é pendente → coletado → em_analise → validado → liberado, mas a
   * liberação gravava `liberado = true` direto, sem olhar em que etapa a coleta
   * estava. Um resultado digitado errado — ou ainda em análise — podia ser
   * liberado e o paciente notificado antes de qualquer conferência.
   */
  const ETAPAS_QUE_PERMITEM_LIBERAR = ['validado', 'liberado'];

  const conferenciaPendente = (): boolean => {
    if (!coleta?.status) return false;
    return !ETAPAS_QUE_PERMITEM_LIBERAR.includes(coleta.status);
  };

  const avisarConferenciaPendente = () => {
    toast.error('Esta coleta ainda não foi validada.', {
      description: `Situação atual: ${coleta?.status || 'desconhecida'}. Conclua a conferência técnica antes de liberar — o paciente é notificado assim que o resultado sai.`,
      duration: 8000,
    });
  };

  const handleLiberarResultado = async (resultadoId: string) => {
    if (isBusy || releasingIds.has(resultadoId)) return;
    if (conferenciaPendente()) { avisarConferenciaPendente(); return; }

    setReleasingIds(current => new Set(current).add(resultadoId));
    try {
      const { data, error } = await (supabase as any).rpc('liberar_resultados_laboratorio', {
        p_coleta_id: coletaId,
        p_resultado_ids: [resultadoId],
      });
      if (error) throw error;
      if (!data?.some((resultado: { id: string }) => resultado.id === resultadoId)) {
        await fetchData();
        toast.info('Este resultado já foi liberado por outra pessoa.');
        onUpdate();
        return;
      }

      const notificacao = await notificarResultadoLiberado(resultadoId);
      if (notificacao === 'enviada') {
        toast.success('Resultado liberado e paciente notificado!');
      } else if (notificacao === 'enfileirada') {
        toast.warning('Resultado liberado; notificação entrou na fila de reenvio.');
      } else {
        toast.error('Resultado liberado, mas a notificação falhou e não entrou na fila. Avise o paciente manualmente.');
      }
      await fetchData();
      onUpdate();
    } catch (err: any) {
      console.error('handleLiberarResultado error:', err);
      toast.error('Erro ao liberar: ' + (err?.message || 'Erro desconhecido'));
    } finally {
      setReleasingIds(current => { const next = new Set(current); next.delete(resultadoId); return next; });
    }
  };

  const handleLiberarTodos = async () => {
    if (isBusy || !coleta?.resultados_laboratorio?.length) return;
    const pendentes = coleta.resultados_laboratorio.filter((r: any) => !r.liberado);
    if (pendentes.length === 0) { toast.info('Todos já liberados'); return; }
    // A liberação em lote é o caminho mais usado — e era o que menos conferia.
    if (conferenciaPendente()) { avisarConferenciaPendente(); return; }
    setIsReleasingAll(true);
    try {
      // A RPC atualiza todos os resultados e a coleta dentro da mesma
      // transação. Se qualquer validação do banco falhar, nenhum resultado
      // fica parcialmente publicado.
      const { data: liberadosData, error: liberacaoError } = await (supabase as any)
        .rpc('liberar_resultados_laboratorio', {
          p_coleta_id: coletaId,
          p_resultado_ids: pendentes.map((r: any) => r.id),
        });
      if (liberacaoError) throw liberacaoError;

      const liberados = (liberadosData ?? []).map((r: { id: string }) => r.id);
      let notificacoesEnfileiradas = 0;
      let notificacoesFalhadas = 0;

      for (const resultadoId of liberados) {
        const notificacao = await notificarResultadoLiberado(resultadoId);
        if (notificacao === 'enfileirada') notificacoesEnfileiradas++;
        else if (notificacao === 'falhou') notificacoesFalhadas++;
      }

      if (liberados.length === 0) {
        toast.error('Nenhum resultado pôde ser liberado.');
        return;
      }

      // O status da coleta já foi atualizado pela mesma RPC, junto com os
      // resultados. Se ainda houver pendentes, a função mantém a coleta em
      // validado e o contador abaixo informa a liberação parcial.
      const naoLiberados = pendentes.length - liberados.length;
      const partes = [`${liberados.length} de ${pendentes.length} resultado(s) liberado(s)`];
      if (naoLiberados > 0) partes.push(`${naoLiberados} falhou(aram)`);
      if (notificacoesEnfileiradas > 0) partes.push(`${notificacoesEnfileiradas} notificação(ões) na fila de reenvio`);
      if (notificacoesFalhadas > 0) partes.push(`${notificacoesFalhadas} notificação(ões) falharam e exigem contato manual`);
      const msg = partes.join(' · ');

      if (naoLiberados > 0) toast.warning(msg);
      else toast.success(msg);
      await fetchData();
      onUpdate();
    } catch (err: any) {
      console.error('handleLiberarTodos error:', err);
      toast.error('Erro ao liberar em lote: ' + (err?.message || 'Erro desconhecido'));
    } finally {
      setIsReleasingAll(false);
    }
  };

  const handleValidarColeta = async () => {
    if (isValidating) return;
    if (coleta?.status !== 'em_analise') {
      toast.error('A coleta precisa estar em análise antes da validação.');
      return;
    }
    if (!coleta?.resultados_laboratorio?.length) {
      toast.error('Inclua ao menos um resultado antes de validar a coleta.');
      return;
    }
    setIsValidating(true);
    try {
      const { error } = await (supabase as any).rpc('validar_coleta_laboratorio', {
        p_coleta_id: coletaId,
      });
      if (error) throw error;
      toast.success('Coleta validada e conferência registrada!');
      await fetchData();
      onUpdate();
    } catch (e) {
      toast.error('Erro ao validar.', { description: mensagemDeErro(e) });
    } finally {
      setIsValidating(false);
    }
  };

  const buildLaudoData = (): LaudoData | null => {
    if (!coleta) return null;

    return {
      codigoAmostra: coleta.codigo_amostra,
      pacienteNome: coleta.pacientes?.nome_social?.trim() || coleta.pacientes?.nome || '—',
      pacienteCpf: coleta.pacientes?.cpf,
      pacienteDataNascimento: coleta.pacientes?.data_nascimento,
      pacienteSexo: coleta.pacientes?.sexo,
      medicoNome: coleta.medicos?.nome,
      medicoCrm: coleta.medicos?.crm,
      dataColeta: formatDateTimeSaoPaulo(coleta.data_coleta || coleta.created_at, true),
      tipoAmostra: coleta.tipo_amostra,
      tubo: coleta.tubo,
      urgente: coleta.urgente,
      observacoes: observacaoLaudo || undefined,
      requisicao: (coleta as any).numero_guia || coleta.codigo_amostra,
      convenioNome: (coleta as any).convenios?.nome,
      resultados: (coleta.resultados_laboratorio || []).map((r: any) => ({
        parametro: r.parametro,
        resultado: r.resultado,
        unidade: r.unidade,
        valorReferenciaMin: r.valor_referencia_min,
        valorReferenciaMax: r.valor_referencia_max,
        valorReferenciaTexto: r.valor_referencia_texto,
        metodo: r.metodo,
        material: (coleta as any).material || coleta.tipo_amostra,
        tipoExame: r.exames?.tipo_exame,
        liberado: r.liberado,
        dataLiberacao: r.data_liberacao,
      })),
    };
  };

  const handlePrintLaudo = async () => {
    try {
      const laudoData = buildLaudoData();
      if (!laudoData) return;
      await gerarLaudoPDF(laudoData);
    } catch (err: any) {
      toast.error('Erro ao imprimir laudo: ' + (err?.message || 'Erro desconhecido'));
    }
  };

  const handleDownloadLaudo = async () => {
    try {
      const laudoData = buildLaudoData();
      if (!laudoData) return;
      await downloadLaudoPDF(laudoData);
    } catch (err: any) {
      toast.error('Erro ao baixar laudo: ' + (err?.message || 'Erro desconhecido'));
    }
  };

  const totalResults = coleta?.resultados_laboratorio?.length || 0;
  const liberados = coleta?.resultados_laboratorio?.filter((r: any) => r.liberado).length || 0;
  const pendentes = totalResults - liberados;

  return (
    <Dialog open={!!coletaId} onOpenChange={(open) => { if (open || !isBusy) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Laudo — {coleta?.codigo_amostra ?? '...'}
            {coleta?.urgente && <Badge variant="destructive" className="text-[10px]">Urgente</Badge>}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : loadError ? (
          <ErrorState compact error={loadError} title="Não foi possível carregar este laudo" onRetry={() => void fetchData()} />
        ) : coleta ? (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Patient info */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 rounded-xl border p-4 bg-muted/20">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Paciente</p>
                <p className="font-semibold">{coleta.pacientes?.nome_social?.trim() || coleta.pacientes?.nome || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">CPF</p>
                <p className="font-medium">{coleta.pacientes?.cpf ?? '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Código</p>
                <p className="font-medium font-mono">{coleta.codigo_amostra ?? '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Entrada</p>
                <p className="font-medium">
                  {formatDateTimeSaoPaulo(coleta.created_at)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Coleta</p>
                <p className="font-medium">
                  {formatDateTimeSaoPaulo(coleta.data_coleta)}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/10">
              <Activity className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span>{liberados}/{totalResults} liberado(s)</span>
                  <span className="font-semibold">{totalResults > 0 ? Math.round((liberados / totalResults) * 100) : 0}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${totalResults > 0 ? (liberados / totalResults) * 100 : 0}%` }} />
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="space-y-2">
              {(coleta.resultados_laboratorio ?? []).map((res: any) => {
                const numResult = parseResultadoNumerico(res.resultado);
                const isAltered = numResult !== null && (
                  (res.valor_referencia_min != null && numResult < res.valor_referencia_min) ||
                  (res.valor_referencia_max != null && numResult > res.valor_referencia_max)
                );
                return (
                  <div key={res.id} className={cn(
                    'rounded-lg border p-3 space-y-1',
                    res.liberado ? 'border-success/30 bg-success/5' : '',
                    isAltered && !res.liberado ? 'border-destructive/30 bg-destructive/5' : '',
                  )}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{res.parametro ?? '—'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {res.exames?.tipo_exame ?? '—'}{res.metodo ? ` · ${res.metodo}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isAltered && <Badge variant="destructive" className="text-[10px] gap-1"><AlertTriangle className="h-2.5 w-2.5" />Alterado</Badge>}
                        {res.liberado ? (
                          <Badge className="bg-success/10 text-success border-success/20 gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Liberado
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>
                        )}
                      </div>
                    </div>
                    {res.resultado && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Resultado</p>
                          <p className={cn('font-bold', isAltered ? 'text-destructive' : 'text-primary')}>
                            {res.resultado} {res.unidade ?? ''}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Referência</p>
                          <p className="font-medium">
                            {res.valor_referencia_texto || `${res.valor_referencia_min ?? '—'} - ${res.valor_referencia_max ?? '—'}`}
                          </p>
                        </div>
                        {res.data_liberacao && (
                          <div>
                            <p className="text-[11px] text-muted-foreground">Liberado em</p>
                            <p className="font-medium text-xs">{formatDateTimeSaoPaulo(res.data_liberacao)}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {!res.liberado && (
                      <Button size="sm" className="h-7 text-xs gap-1 mt-1" disabled={isBusy || conferenciaPendente()} onClick={() => handleLiberarResultado(res.id)}>
                        {releasingIds.has(res.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        {releasingIds.has(res.id) ? 'Liberando...' : 'Liberar'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Observations */}
            <div className="space-y-1.5">
              <Label className="text-xs">Observações do Laudo</Label>
              <Textarea value={observacaoLaudo} onChange={e => setObservacaoLaudo(e.target.value)}
                placeholder="Observações técnicas para o laudo impresso..." rows={2} />
            </div>
          </div>
        ) : null}

        {/* Footer actions */}
        {coleta && (
          <DialogFooter className="border-t pt-3 gap-2 flex-wrap">
            {coleta.status === 'em_analise' && (
              <Button variant="outline" className="gap-1" onClick={handleValidarColeta} disabled={isBusy || !coleta.resultados_laboratorio?.length}>
                {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                {isValidating ? 'Validando...' : 'Validar Coleta'}
              </Button>
            )}
            {coleta.status !== 'em_analise' && coleta.status !== 'validado' && coleta.status !== 'liberado' && (
              <p className="mr-auto text-xs text-muted-foreground">Avance a coleta para “Em análise” antes de validar.</p>
            )}
            {pendentes > 0 && (
              <Button variant="default" className="gap-1" onClick={handleLiberarTodos} disabled={isBusy || conferenciaPendente()}>
                {isReleasingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {isReleasingAll ? 'Liberando...' : `Liberar Todos (${pendentes})`}
              </Button>
            )}
            <Button variant="outline" className="gap-1" onClick={handleDownloadLaudo}>
              <Download className="h-4 w-4" /> Baixar PDF
            </Button>
            <Button variant="outline" className="gap-1" onClick={handlePrintLaudo}>
              <Printer className="h-4 w-4" /> Imprimir Laudo
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function LaudosLab() {
  const { profile } = useSupabaseAuth();
  const [coletas, setColetas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [cursorLaudos, setCursorLaudos] = useState<{ created_at: string; id: string } | null>(null);
  const [hasOlderLaudos, setHasOlderLaudos] = useState(false);
  const [loadingOlderLaudos, setLoadingOlderLaudos] = useState(false);
  const [olderLaudosError, setOlderLaudosError] = useState<unknown>(null);
  const fetchRequestRef = useRef(0);
  const activeClinicRef = useRef<string | null>(null);

  const fetchLaudos = useCallback(async () => {
    const clinicId = profile?.clinica_id ?? null;
    if (activeClinicRef.current !== clinicId) return;
    const requestId = ++fetchRequestRef.current;

    if (!clinicId) {
      setColetas([]);
      setCursorLaudos(null);
      setHasOlderLaudos(false);
      setLoadError(new Error('Clínica não identificada.'));
      setLoading(false);
      return;
    }
    // Atualizações manuais, realtime e pós-liberação são em segundo plano.
    // Trocar a página inteira pelo skeleton desmontava o modal e descartava
    // observações ainda não impressas no laudo.
    setLoadingOlderLaudos(false);
    setOlderLaudosError(null);
    // A ordenação era ASCENDENTE e sem `.limit()`. O PostgREST corta em 1.000
    // linhas por padrão, então numa base com histórico o laboratório recebia as
    // amostras mais ANTIGAS e as de hoje nunca apareciam na tela de laudos.
    //
    // Buscamos as mais recentes e reordenamos em memória para manter o FIFO
    // dentro da janela de trabalho — que é o que a bancada precisa.
    try {
      const { data, error } = await supabase
        .from('coletas_laboratorio')
        .select(`
          id, codigo_amostra, status, created_at, data_coleta, urgente, tipo_amostra, tubo,
          pacientes(nome, nome_social, cpf, telefone, email),
          medicos(nome, crm),
          resultados_laboratorio(id, liberado, parametro, resultado, unidade,
            valor_referencia_min, valor_referencia_max, exames(tipo_exame))
        `)
        .eq('clinica_id', clinicId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(TETO_WORKLIST + 1);

      if (requestId !== fetchRequestRef.current || activeClinicRef.current !== clinicId) return;
      if (error) throw error;

      const linhas = data ?? [];
      const janela = linhas.slice(0, TETO_WORKLIST);
      setHasOlderLaudos(linhas.length > TETO_WORKLIST);
      setCursorLaudos(janela.length ? {
        created_at: janela[janela.length - 1].created_at,
        id: janela[janela.length - 1].id,
      } : null);

      const comResultados = janela
        .filter((c: any) => (c.resultados_laboratorio ?? []).length > 0)
        // FIFO: mais antiga primeiro, dentro da janela carregada.
        .sort((a: any, b: any) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      setColetas(atuais => {
        const porId = new Map<string, any>();
        for (const coleta of atuais) porId.set(coleta.id, coleta);
        // Atualizar a worklist não deve apagar os laudos antigos que a pessoa
        // já carregou. Os registros da janela mais recente substituem os do
        // cache; os mais antigos permanecem disponíveis sem duplicatas.
        for (const coleta of comResultados) porId.set(coleta.id, coleta);
        return [...porId.values()].sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });
      setLoadError(null);
    } catch (error) {
      if (requestId === fetchRequestRef.current && activeClinicRef.current === clinicId) setLoadError(error);
    } finally {
      if (requestId === fetchRequestRef.current && activeClinicRef.current === clinicId) setLoading(false);
    }
  }, [profile?.clinica_id]);

  const carregarLaudosAntigos = async () => {
    const clinicId = profile?.clinica_id;
    const cursor = cursorLaudos;
    if (!clinicId || !cursor || !hasOlderLaudos || loadingOlderLaudos) return;
    const requestId = fetchRequestRef.current;
    setLoadingOlderLaudos(true);
    setOlderLaudosError(null);
    try {
      const { data, error } = await supabase
        .from('coletas_laboratorio')
        .select(`
          id, codigo_amostra, status, created_at, data_coleta, urgente, tipo_amostra, tubo,
          pacientes(nome, nome_social, cpf, telefone, email),
          medicos(nome, crm),
          resultados_laboratorio(id, liberado, parametro, resultado, unidade,
            valor_referencia_min, valor_referencia_max, exames(tipo_exame))
        `)
        .eq('clinica_id', clinicId)
        .or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(TETO_WORKLIST + 1);
      if (error) throw error;
      if (requestId !== fetchRequestRef.current || activeClinicRef.current !== clinicId) return;

      const linhas = data ?? [];
      const janela = linhas.slice(0, TETO_WORKLIST);
      setCursorLaudos(janela.length ? {
        created_at: janela[janela.length - 1].created_at,
        id: janela[janela.length - 1].id,
      } : cursor);
      setHasOlderLaudos(linhas.length > TETO_WORKLIST);
      const comResultados = janela
        .filter((c: any) => (c.resultados_laboratorio ?? []).length > 0)
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setColetas(atuais => {
        const porId = new Map<string, any>(atuais.map(coleta => [coleta.id, coleta]));
        for (const coleta of comResultados) porId.set(coleta.id, coleta);
        return [...porId.values()].sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });
    } catch (error) {
      if (requestId === fetchRequestRef.current && activeClinicRef.current === clinicId) setOlderLaudosError(error);
    } finally {
      if (requestId === fetchRequestRef.current && activeClinicRef.current === clinicId) setLoadingOlderLaudos(false);
    }
  };

  useEffect(() => {
    const clinicId = profile?.clinica_id ?? null;
    activeClinicRef.current = clinicId;
    fetchRequestRef.current += 1;
    setColetas([]);
    setCursorLaudos(null);
    setHasOlderLaudos(false);
    setLoadingOlderLaudos(false);
    setOlderLaudosError(null);
    setLoading(true);
    setLoadError(null);
    void fetchLaudos();
    if (!clinicId) return () => { activeClinicRef.current = null; fetchRequestRef.current += 1; };
    const channel = supabase.channel(canalUnico('laudos-rt'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resultados_laboratorio', filter: `clinica_id=eq.${clinicId}` }, fetchLaudos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coletas_laboratorio', filter: `clinica_id=eq.${clinicId}` }, fetchLaudos)
      .subscribe();
    return () => {
      if (activeClinicRef.current === clinicId) activeClinicRef.current = null;
      fetchRequestRef.current += 1;
      supabase.removeChannel(channel);
    };
  }, [fetchLaudos, profile?.clinica_id]);

  const getExamesLiberados = (c: any) =>
    (c.resultados_laboratorio ?? []).filter((r: any) => r.liberado === true);
  const getExamesPendentes = (c: any) =>
    (c.resultados_laboratorio ?? []).filter((r: any) => r.liberado !== true);
  const hasAlterado = (c: any) =>
    (c.resultados_laboratorio ?? []).some((r: any) => {
      const num = parseResultadoNumerico(r.resultado);
      if (num === null) return false;
      return (r.valor_referencia_min != null && num < r.valor_referencia_min) ||
             (r.valor_referencia_max != null && num > r.valor_referencia_max);
    });

  const filtradas = useMemo(() => {
    return coletas.filter(c => {
      if (search.trim()) {
        const q = normalize(search.trim());
        const nomes = (c.resultados_laboratorio ?? []).map((r: any) => normalize(r.parametro ?? ''));
        if (
          !(c.pacientes && pacienteCorresponde(c.pacientes, search)) &&
          !normalize(c.codigo_amostra ?? '').includes(q) &&
          !nomes.some((n: string) => n.includes(q))
        ) return false;
      }
      if (statusFilter === 'liberado') {
        return getExamesLiberados(c).length > 0 && getExamesPendentes(c).length === 0;
      }
      if (statusFilter === 'parcial') {
        return getExamesLiberados(c).length > 0 && getExamesPendentes(c).length > 0;
      }
      if (statusFilter === 'pendente') {
        return getExamesPendentes(c).length > 0 && getExamesLiberados(c).length === 0;
      }
      if (statusFilter === 'alterado') return hasAlterado(c);
      return true;
    });
  }, [coletas, search, statusFilter]);
  const limparFiltros = () => {
    setSearch('');
    setStatusFilter('todos');
  };

  const totalLiberados = coletas.filter(c => getExamesLiberados(c).length > 0 && getExamesPendentes(c).length === 0).length;
  const totalParciais = coletas.filter(c => getExamesLiberados(c).length > 0 && getExamesPendentes(c).length > 0).length;
  const totalPendentes = coletas.filter(c => getExamesPendentes(c).length > 0 && getExamesLiberados(c).length === 0).length;
  const totalAlterados = coletas.filter(c => hasAlterado(c)).length;

  if (loading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-64" /><div className="grid grid-cols-2 md:grid-cols-5 gap-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-96" /></div>;
  }
  if (loadError) {
    return <ErrorState title="Não foi possível carregar os laudos" error={loadError} onRetry={() => { setLoading(true); void fetchLaudos(); }} />;
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Laudos Laboratoriais
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Validação e liberação de resultados · {coletas.length} laudo(s)
          </p>
        </div>
        <Button variant="outline" className="gap-2" disabled={loading} onClick={fetchLaudos}>
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {[
          { label: 'Total', value: coletas.length, icon: FileText, color: 'text-primary', filter: 'todos' },
          { label: 'Pendentes', value: totalPendentes, icon: Clock, color: 'text-warning', filter: 'pendente' },
          { label: 'Parciais', value: totalParciais, icon: AlertCircle, color: 'text-orange-500', filter: 'parcial' },
          { label: 'Liberados', value: totalLiberados, icon: CheckCircle2, color: 'text-green-500', filter: 'liberado' },
          { label: 'Alterados', value: totalAlterados, icon: AlertTriangle, color: 'text-destructive', filter: 'alterado' },
        ].map(s => (
          <Card key={s.label} className={cn(
            'cursor-pointer hover:shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            statusFilter === s.filter && 'ring-2 ring-primary'
          )}
            role="button"
            tabIndex={0}
            aria-pressed={statusFilter === s.filter}
            onClick={() => setStatusFilter(statusFilter === s.filter ? 'todos' : s.filter)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setStatusFilter(statusFilter === s.filter ? 'todos' : s.filter);
              }
            }}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <s.icon className={cn('h-5 w-5 shrink-0', s.color)} />
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Nome, CPF, telefone, código ou exame..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : filtradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground font-medium">
                {coletas.length > 0
                  ? 'Nenhum laudo corresponde à busca e ao status selecionados'
                  : hasOlderLaudos
                    ? 'Nenhum laudo encontrado entre os registros carregados'
                    : 'Ainda não há laudos registrados'}
              </p>
              {coletas.length > 0 && (search.trim() || statusFilter !== 'todos') && (
                <Button variant="link" onClick={limparFiltros} className="mt-2 h-11">Limpar busca e status</Button>
              )}
              {coletas.length === 0 && hasOlderLaudos && <p className="mt-1 text-sm text-muted-foreground">Carregue laudos anteriores para ampliar a busca.</p>}
            </div>
          ) : (
            <motion.table variants={stagger} initial="hidden" animate="visible" className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Código</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Paciente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Exames</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Progresso</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Entrada</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((c, idx) => {
                  const liberados = getExamesLiberados(c);
                  const pendentes = getExamesPendentes(c);
                  const total = c.resultados_laboratorio?.length || 0;
                  const todoLiberado = liberados.length > 0 && pendentes.length === 0;
                  const parcial = liberados.length > 0 && pendentes.length > 0;
                  const alterado = hasAlterado(c);
                  return (
                    <motion.tr key={c.id} variants={fadeUp}
                      className={cn(
                        'border-b border-border/50 last:border-0 transition-colors hover:bg-muted/20',
                        todoLiberado && 'opacity-60 hover:opacity-100',
                        c.urgente && 'bg-destructive/5',
                      )}>
                      <td className="px-4 py-2.5 text-xs font-bold text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-primary font-semibold">{c.codigo_amostra ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {c.urgente && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                          <div>
                            <p className="font-medium">{c.pacientes?.nome_social?.trim() || c.pacientes?.nome || '—'}</p>
                            <p className="text-[11px] text-muted-foreground">{c.pacientes?.cpf ?? ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {liberados.slice(0, 2).map((r: any) => (
                            <Badge key={r.id} variant="secondary" className="text-[10px]">{r.parametro ?? '—'}</Badge>
                          ))}
                          {total > 2 && <span className="text-[10px] text-muted-foreground">+{total - 2}</span>}
                          {alterado && <Badge variant="destructive" className="text-[10px] gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />Alt.</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${total > 0 ? (liberados.length / total) * 100 : 0}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{liberados.length}/{total}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {todoLiberado ? (
                          <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">Liberado</Badge>
                        ) : parcial ? (
                          <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px]">Parcial</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Pendente</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">
                        {c.created_at ? formatDistanceToNow(new Date(c.created_at), { locale: ptBR, addSuffix: true }) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setViewingId(c.id)}>
                          <Eye className="h-3 w-3" /> Ver Laudo
                        </Button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </motion.table>
          )}
        </CardContent>
      </Card>

      {olderLaudosError && (
        <ErrorState
          compact
          title="Não foi possível carregar laudos anteriores"
          error={olderLaudosError}
          onRetry={() => void carregarLaudosAntigos()}
          retryLabel="Tentar novamente"
        />
      )}
      {hasOlderLaudos && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">{coletas.length} laudo(s) carregado(s)</p>
          <Button
            variant="outline"
            onClick={() => void carregarLaudosAntigos()}
            disabled={loadingOlderLaudos}
            className="gap-2"
          >
            {loadingOlderLaudos && <Loader2 className="h-4 w-4 animate-spin" />}
            {loadingOlderLaudos ? 'Carregando...' : 'Carregar laudos anteriores'}
          </Button>
        </div>
      )}

      <LaudoDetalheModal coletaId={viewingId} onClose={() => setViewingId(null)} onUpdate={fetchLaudos} />
    </div>
  );
}
