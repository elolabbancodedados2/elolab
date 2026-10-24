import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  FileText, Eye, CheckCircle2, AlertCircle, Loader2, RefreshCw,
  Search, AlertTriangle, Clock, Download, Printer, Shield, XCircle,
  User, Activity, History, PencilLine, MessageCircle, X,
  FlaskConical, TestTube, FileSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { deveNotificarRetificacao, formatarReferenciaLaudo, perfilPodeRetificarResultado, podeRetificarResultado, procedenciaResultadoLaudo, trilhaDeVersoes } from '@/lib/laudoWorkflow';
import { cursorAposAtualizacaoWorklist, type CursorLaudo } from '@/lib/laudoWorklist';
import { LaboratorioSubnav } from '@/components/laboratorio/LaboratorioSubnav';
import { criticalAcknowledgementIsPending } from '@/lib/criticalResultAcknowledgement';
import { linkWhatsApp } from '@/lib/whatsapp';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';

/**
 * Teto da worklist do laboratório.
 *
 * O PostgREST corta em 1.000 linhas por padrão e não avisa. Pedimos um a mais
 * que este teto para detectar o corte e dizer ao operador que existe mais
 * histórico, em vez de deixá-lo achar que a amostra sumiu.
 */
const TETO_WORKLIST = 500;


const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
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
  const [retificacao, setRetificacao] = useState<null | { id: string; parametro: string; resultado: string; unidade: string; referenciaMin: string; referenciaMax: string; referenciaTexto: string; metodo: string; critico: boolean; motivo: string; liberado: boolean }>(null);
  const [historicoResultadoId, setHistoricoResultadoId] = useState<string | null>(null);
  const [historicoResultado, setHistoricoResultado] = useState<any[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [salvandoRetificacao, setSalvandoRetificacao] = useState(false);
  const [condutasCiencia, setCondutasCiencia] = useState<Record<string, string>>({});
  const [confirmandoCienciaId, setConfirmandoCienciaId] = useState<string | null>(null);
  const isBusy = isValidating || isReleasingAll || releasingIds.size > 0 || salvandoRetificacao || confirmandoCienciaId !== null;
  const podeRetificarLiberado = perfilPodeRetificarResultado(profile?.roles);
  const podeConfirmarCienciaCritica = profile?.roles?.some((role: string) => role === 'admin' || role === 'medico') === true;

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
          resultados_laboratorio(id, parametro, resultado, unidade, critico, numero_versao,
            valor_referencia_min, valor_referencia_max, valor_referencia_texto,
            liberado, data_liberacao, validado_por, data_validacao, liberado_por, metodo, equipamento,
            validadores:profiles!resultados_laboratorio_validado_por_fkey(nome),
            liberadores:profiles!resultados_laboratorio_liberado_por_fkey(nome), exames(tipo_exame, laboratorios(nome)),
            confirmacoes:resultado_critico_confirmacoes(id, numero_versao, conduta, confirmado_em,
              confirmador:profiles!resultado_critico_confirmacoes_confirmado_por_fkey(nome)))
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

  const abrirRetificacao = (res: any) => setRetificacao({
    id: res.id, parametro: String(res.parametro ?? ''), resultado: String(res.resultado ?? ''),
    unidade: String(res.unidade ?? ''), referenciaMin: res.valor_referencia_min == null ? '' : String(res.valor_referencia_min),
    referenciaMax: res.valor_referencia_max == null ? '' : String(res.valor_referencia_max),
    referenciaTexto: String(res.valor_referencia_texto ?? ''), metodo: String(res.metodo ?? ''),
    critico: !!res.critico, motivo: '', liberado: res.liberado === true,
  });

  const salvarRetificacao = async () => {
    if (!retificacao || isBusy) return;
    const minimo = retificacao.referenciaMin.trim() ? parseResultadoNumerico(retificacao.referenciaMin) : null;
    const maximo = retificacao.referenciaMax.trim() ? parseResultadoNumerico(retificacao.referenciaMax) : null;
    if (!retificacao.resultado.trim() || (retificacao.referenciaMin.trim() && minimo == null) || (retificacao.referenciaMax.trim() && maximo == null)) {
      toast.error('Confira o resultado e os limites numéricos antes de salvar.'); return;
    }
    if (retificacao.motivo.trim().length < 10) { toast.error('Descreva o motivo da retificação (mínimo 10 caracteres).'); return; }
    setSalvandoRetificacao(true);
    try {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Atualize a sessão e tente novamente.');
      // Read the persisted flag immediately before mutation, not from the modal-opening snapshot.
      const { data: estadoPersistido, error: erroEstado } = await supabase.from('resultados_laboratorio')
        .select('liberado').eq('id', retificacao.id).eq('clinica_id', profile.clinica_id).maybeSingle();
      if (erroEstado) throw erroEstado;
      if (!estadoPersistido) throw new Error('Resultado não encontrado na clínica atual. Atualize a tela.');
      const { error } = await (supabase as any).rpc('retificar_resultado_laboratorio', {
        p_resultado_id: retificacao.id, p_resultado: retificacao.resultado.trim(), p_unidade: retificacao.unidade,
        p_referencia_min: minimo, p_referencia_max: maximo, p_referencia_texto: retificacao.referenciaTexto,
        p_metodo: retificacao.metodo, p_critico: retificacao.critico, p_motivo: retificacao.motivo.trim(),
      });
      if (error) throw error;
      const precisaNotificar = deveNotificarRetificacao(estadoPersistido.liberado, retificacao.liberado);
      if (precisaNotificar) {
        const notificacao = await notificarResultadoLiberado(retificacao.id);
        toast.success(notificacao === 'falhou'
          ? 'Retificação salva; notificação não enviada. Avise o paciente diretamente.'
          : notificacao === 'enfileirada'
            ? 'Retificação salva; notificação entrou na fila de reenvio.'
            : 'Resultado retificado e paciente notificado. A versão anterior foi preservada no histórico.');
      } else {
        toast.success('Resultado corrigido antes da liberação. A versão anterior foi preservada no histórico.');
      }
      setRetificacao(null); await fetchData(); onUpdate();
      if (historicoResultadoId === retificacao.id) await carregarHistorico(retificacao.id);
    } catch (error) { toast.error('Não foi possível retificar o resultado.', { description: mensagemDeErro(error) }); }
    finally { setSalvandoRetificacao(false); }
  };

  async function carregarHistorico(resultadoId: string) {
    if (!profile?.clinica_id) return;
    if (historicoResultadoId === resultadoId) { setHistoricoResultadoId(null); return; }
    setHistoricoResultadoId(resultadoId); setCarregandoHistorico(true); setHistoricoResultado([]);
    try {
      const { data, error } = await (supabase as any).from('resultados_laboratorio_versoes')
        .select('id, numero_versao, registro_anterior, motivo, alterado_por, alterado_em, autor:profiles!resultados_laboratorio_versoes_alterado_por_fkey(nome)')
        .eq('clinica_id', profile.clinica_id).eq('resultado_id', resultadoId).order('numero_versao', { ascending: false });
      if (error) throw error;
      setHistoricoResultado(data ?? []);
    } catch (error) { toast.error('Não foi possível carregar o histórico.', { description: mensagemDeErro(error) }); }
    finally { setCarregandoHistorico(false); }
  }

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

  const handleConfirmarCienciaCritica = async (resultadoId: string) => {
    const conduta = condutasCiencia[resultadoId]?.trim() ?? '';
    if (isBusy || !podeConfirmarCienciaCritica || conduta.length < 10 || conduta.length > 2000) return;

    setConfirmandoCienciaId(resultadoId);
    try {
      const { error } = await (supabase as any).rpc('confirmar_ciencia_resultado_critico', {
        p_resultado_id: resultadoId,
        p_conduta: conduta,
      });
      if (error) throw error;
      setCondutasCiencia(current => ({ ...current, [resultadoId]: '' }));
      await fetchData();
      onUpdate();
      toast.success('Ciência e conduta registradas para a versão atual do resultado.');
    } catch (error) {
      console.error('handleConfirmarCienciaCritica error:', error);
      toast.error(`Não foi possível registrar a ciência: ${mensagemDeErro(error)}`);
    } finally {
      setConfirmandoCienciaId(null);
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
        equipamento: r.equipamento,
        laboratorio: r.exames?.laboratorios?.nome,
        material: (coleta as any).material || coleta.tipo_amostra,
        tipoExame: r.exames?.tipo_exame,
        liberado: r.liberado,
        dataLiberacao: r.data_liberacao,
        validadoPor: r.validadores?.nome,
        dataValidacao: r.data_validacao,
        liberadoPor: r.liberadores?.nome,
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
                const confirmacaoCriticaAtual = (res.confirmacoes ?? []).find(
                  (confirmacao: any) => confirmacao.numero_versao === res.numero_versao
                );
                const cienciaCriticaPendente = criticalAcknowledgementIsPending(res);
                const numResult = parseResultadoNumerico(res.resultado);
                const isAltered = numResult !== null && (
                  (res.valor_referencia_min != null && numResult < res.valor_referencia_min) ||
                  (res.valor_referencia_max != null && numResult > res.valor_referencia_max)
                );
                return (
                  <div key={res.id} className={cn(
                    'rounded-lg border p-3 space-y-1',
                    res.liberado ? 'border-success/30 bg-success/5' : '',
                    (isAltered || res.critico) && !res.liberado ? 'border-destructive/30 bg-destructive/5' : '',
                  )}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{res.parametro ?? '—'}</p>
                        <p className="text-[11px] text-muted-foreground">{res.exames?.tipo_exame ?? '—'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {procedenciaResultadoLaudo({ metodo: res.metodo, equipamento: res.equipamento, laboratorio: res.exames?.laboratorios?.nome ?? 'própria clínica' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isAltered && <Badge variant="destructive" className="text-[10px] gap-1 rounded-full"><AlertTriangle className="h-2.5 w-2.5" />Alterado</Badge>}
                        {res.critico && <Badge variant="destructive" className="text-[10px] gap-1 rounded-full"><AlertCircle className="h-2.5 w-2.5" />Crítico · revisão prioritária</Badge>}
                        {res.critico && <Badge variant={cienciaCriticaPendente ? 'destructive' : 'secondary'} className="text-[10px] rounded-full">
                          {cienciaCriticaPendente ? 'Aguardando ciência e conduta' : 'Ciência registrada'}
                        </Badge>}
                        {res.liberado ? (
                          <Badge className="bg-success/10 text-success border-success/20 gap-1 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Liberado
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1 rounded-full"><Clock className="h-3 w-3" /> Pendente</Badge>
                        )}
                      </div>
                    </div>
                    {res.resultado && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Resultado observado</p>
                          <p className={cn('font-bold', isAltered ? 'text-destructive' : 'text-primary')}>
                            {res.resultado} {res.unidade ?? ''}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Intervalo de referência</p>
                          <p className="font-medium">
                            {formatarReferenciaLaudo({ valorReferenciaMin: res.valor_referencia_min, valorReferenciaMax: res.valor_referencia_max, valorReferenciaTexto: res.valor_referencia_texto, unidade: res.unidade })}
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
                    {res.critico && (confirmacaoCriticaAtual ? (
                      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs">
                        <p className="font-semibold">Conduta registrada por {confirmacaoCriticaAtual.confirmador?.nome || 'profissional autorizado'}</p>
                        <p className="text-muted-foreground">{formatDateTimeSaoPaulo(confirmacaoCriticaAtual.confirmado_em)}</p>
                        <p className="mt-1 whitespace-pre-wrap">{confirmacaoCriticaAtual.conduta}</p>
                      </div>
                    ) : (
                      <div role="status" className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                        <p className="text-sm font-semibold text-destructive">Resultado crítico aguardando ciência e conduta.</p>
                        {podeConfirmarCienciaCritica ? (
                          <>
                            <Label htmlFor={`conduta-critica-${res.id}`} className="text-xs">Conduta documentada pelo profissional responsável</Label>
                            <Textarea
                              id={`conduta-critica-${res.id}`}
                              value={condutasCiencia[res.id] ?? ''}
                              maxLength={2000}
                              rows={3}
                              onChange={event => setCondutasCiencia(current => ({ ...current, [res.id]: event.target.value }))}
                              placeholder="Registre a conduta definida para este resultado."
                            />
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[11px] text-muted-foreground">Mínimo de 10 e máximo de 2.000 caracteres.</p>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={isBusy || (condutasCiencia[res.id] ?? '').trim().length < 10}
                                onClick={() => void handleConfirmarCienciaCritica(res.id)}
                              >
                                {confirmandoCienciaId === res.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                                Confirmar ciência
                              </Button>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">Somente médico ou administrador da clínica pode registrar ciência e conduta.</p>
                        )}
                      </div>
                    ))}
                    {!res.liberado && (
                      <Button size="sm" className="h-7 text-xs gap-1 mt-1" disabled={isBusy || conferenciaPendente()} onClick={() => handleLiberarResultado(res.id)}>
                        {releasingIds.has(res.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        {releasingIds.has(res.id) ? 'Liberando...' : 'Liberar'}
                      </Button>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 border-t pt-2">
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => void carregarHistorico(res.id)}><History className="h-3.5 w-3.5" />{historicoResultadoId === res.id ? 'Ocultar histórico' : 'Histórico de versões'}</Button>
                      {podeRetificarResultado(coleta.status, res.liberado === true) && podeRetificarLiberado && <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => abrirRetificacao(res)}><PencilLine className="h-3.5 w-3.5" />{res.liberado ? 'Retificar laudo' : 'Corrigir resultado'}</Button>}
                    </div>
                    {historicoResultadoId === res.id && <div className="space-y-2 rounded-md bg-muted/40 p-3 text-xs">
                      {carregandoHistorico ? <p role="status">Carregando versões…</p> : historicoResultado.length === 0 ? <p>Nenhuma versão anterior registrada.</p> : trilhaDeVersoes(historicoResultado, res).map((versao) => <div key={versao.id} className="border-b pb-2 last:border-0"><p className="font-medium">Versão {versao.numero_versao} → {versao.numero_versao + 1} · {formatDateTimeSaoPaulo(versao.alterado_em)} · {versao.autor?.nome || 'autor não identificado'}</p><p>Resultado anterior: {versao.registro_anterior?.resultado ?? '—'} {versao.registro_anterior?.unidade ?? ''}</p>{versao.alteracoes.length > 0 ? <ul className="list-disc pl-4">{versao.alteracoes.map((alteracao) => <li key={alteracao}>{alteracao}</li>)}</ul> : <p className="text-muted-foreground">Sem mudança nos campos do laudo.</p>}{versao.motivo && <p>Motivo: {versao.motivo}</p>}</div>)}
                    </div>}
                    {retificacao?.id === res.id && <div className="mt-2 space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                      <p className="text-sm font-semibold">Retificar {retificacao.parametro}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Label className="space-y-1 text-xs">Resultado<Input value={retificacao.resultado} onChange={(event) => setRetificacao({ ...retificacao, resultado: event.target.value })} /></Label>
                        <Label className="space-y-1 text-xs">Unidade<Input value={retificacao.unidade} onChange={(event) => setRetificacao({ ...retificacao, unidade: event.target.value })} /></Label>
                        <Label className="space-y-1 text-xs">Referência mínima<Input inputMode="decimal" value={retificacao.referenciaMin} onChange={(event) => setRetificacao({ ...retificacao, referenciaMin: event.target.value })} /></Label>
                        <Label className="space-y-1 text-xs">Referência máxima<Input inputMode="decimal" value={retificacao.referenciaMax} onChange={(event) => setRetificacao({ ...retificacao, referenciaMax: event.target.value })} /></Label>
                        <Label className="space-y-1 text-xs">Referência textual<Input value={retificacao.referenciaTexto} onChange={(event) => setRetificacao({ ...retificacao, referenciaTexto: event.target.value })} /></Label>
                        <Label className="space-y-1 text-xs">Método<Input value={retificacao.metodo} onChange={(event) => setRetificacao({ ...retificacao, metodo: event.target.value })} /></Label>
                      </div>
                      <div className="flex items-center gap-2"><Checkbox id="retificacao-critico" checked={retificacao.critico} onCheckedChange={(checked) => setRetificacao({ ...retificacao, critico: checked === true })} /><Label htmlFor="retificacao-critico" className="text-sm">Marcar como resultado crítico</Label></div>
                      <Label className="block space-y-1 text-xs">Justificativa obrigatória<Textarea value={retificacao.motivo} onChange={(event) => setRetificacao({ ...retificacao, motivo: event.target.value })} minLength={10} maxLength={1000} rows={2} placeholder="Registre o motivo clínico e técnico da retificação" /></Label>
                      <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setRetificacao(null)} disabled={salvandoRetificacao}>Cancelar</Button><Button size="sm" onClick={() => void salvarRetificacao()} disabled={salvandoRetificacao || retificacao.motivo.trim().length < 10}>{salvandoRetificacao ? 'Salvando…' : 'Salvar retificação'}</Button></div>
                    </div>}
                  </div>
                );
              })}
            </div>

            {/* Observations */}
            <div className="space-y-1.5">
              <Label htmlFor="observacoes-laudo" className="text-xs">Observacoes do Laudo</Label>
              <Textarea id="observacoes-laudo" value={observacaoLaudo} onChange={e => setObservacaoLaudo(e.target.value)}
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
              <p className="mr-auto text-xs text-muted-foreground">Avance a coleta para "Em análise" antes de validar.</p>
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
  const [searchParams, setSearchParams] = useSearchParams();
  // A central de notificações abre o laudo do resultado crítico por ?coleta=<id>.
  const [viewingId, setViewingId] = useState<string | null>(() => searchParams.get('coleta'));
  useEffect(() => {
    if (!searchParams.has('coleta')) return;
    setViewingId(searchParams.get('coleta'));
    const params = new URLSearchParams(searchParams);
    params.delete('coleta');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);
  const [cursorLaudos, setCursorLaudos] = useState<CursorLaudo>(null);
  const [hasOlderLaudos, setHasOlderLaudos] = useState(false);
  const [loadingOlderLaudos, setLoadingOlderLaudos] = useState(false);
  const [olderLaudosError, setOlderLaudosError] = useState<unknown>(null);
  const fetchRequestRef = useRef(0);
  const activeClinicRef = useRef<string | null>(null);
  const cursorLaudosRef = useRef<CursorLaudo>(null);
  const historicoCarregadoRef = useRef(false);
  const atualizarCursorLaudos = useCallback((cursor: CursorLaudo) => {
    cursorLaudosRef.current = cursor;
    setCursorLaudos(cursor);
  }, []);

  const fetchLaudos = useCallback(async () => {
    const clinicId = profile?.clinica_id ?? null;
    if (activeClinicRef.current !== clinicId) return;
    const requestId = ++fetchRequestRef.current;

    if (!clinicId) {
      setColetas([]);
      atualizarCursorLaudos(null);
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
    try {
      const { data, error } = await supabase
        .from('coletas_laboratorio')
        .select(`
          id, codigo_amostra, status, created_at, data_coleta, urgente, tipo_amostra, tubo,
          pacientes(nome, nome_social, cpf, telefone, email),
          medicos(nome, crm),
          resultados_laboratorio(id, liberado, parametro, resultado, unidade, critico, numero_versao,
            valor_referencia_min, valor_referencia_max, exames(tipo_exame),
            confirmacoes:resultado_critico_confirmacoes(id, numero_versao))
        `)
        .eq('clinica_id', clinicId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(TETO_WORKLIST + 1);

      if (requestId !== fetchRequestRef.current || activeClinicRef.current !== clinicId) return;
      if (error) throw error;

      const linhas = data ?? [];
      const janela = linhas.slice(0, TETO_WORKLIST);
      const cursorMaisRecente = janela.length ? {
        created_at: janela[janela.length - 1].created_at,
        id: janela[janela.length - 1].id,
      } : null;
      atualizarCursorLaudos(cursorAposAtualizacaoWorklist(cursorLaudosRef.current, cursorMaisRecente, historicoCarregadoRef.current));
      if (!historicoCarregadoRef.current) setHasOlderLaudos(linhas.length > TETO_WORKLIST);

      const comResultados = janela
        .filter((c: any) => (c.resultados_laboratorio ?? []).length > 0)
        .sort((a: any, b: any) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      setColetas(atuais => {
        const porId = new Map<string, any>();
        for (const coleta of atuais) porId.set(coleta.id, coleta);
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
  }, [profile?.clinica_id, atualizarCursorLaudos]);

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
          resultados_laboratorio(id, liberado, parametro, resultado, unidade, critico, numero_versao,
            valor_referencia_min, valor_referencia_max, exames(tipo_exame),
            confirmacoes:resultado_critico_confirmacoes(id, numero_versao))
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
      atualizarCursorLaudos(janela.length ? {
        created_at: janela[janela.length - 1].created_at,
        id: janela[janela.length - 1].id,
      } : cursor);
      historicoCarregadoRef.current = true;
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
    atualizarCursorLaudos(null);
    historicoCarregadoRef.current = false;
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resultado_critico_confirmacoes', filter: `clinica_id=eq.${clinicId}` }, fetchLaudos)
      .subscribe();
    return () => {
      if (activeClinicRef.current === clinicId) activeClinicRef.current = null;
      fetchRequestRef.current += 1;
      supabase.removeChannel(channel);
    };
  }, [fetchLaudos, profile?.clinica_id, atualizarCursorLaudos]);

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
  const hasCritico = (c: any) => (c.resultados_laboratorio ?? []).some((r: any) => r.critico === true);
  const hasCriticoPendente = (c: any) => (c.resultados_laboratorio ?? []).some(criticalAcknowledgementIsPending);

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
      if (statusFilter === 'critico') return hasCritico(c);
      return true;
    });
  }, [coletas, search, statusFilter]);

  const limparFiltros = () => {
    setSearch('');
    setStatusFilter('todos');
  };

  const temFiltro = search.trim() !== '' || statusFilter !== 'todos';

  const totalLiberados = coletas.filter(c => getExamesLiberados(c).length > 0 && getExamesPendentes(c).length === 0).length;
  const totalParciais = coletas.filter(c => getExamesLiberados(c).length > 0 && getExamesPendentes(c).length > 0).length;
  const totalPendentes = coletas.filter(c => getExamesPendentes(c).length > 0 && getExamesLiberados(c).length === 0).length;
  const totalAlterados = coletas.filter(c => hasAlterado(c)).length;
  const totalCriticos = coletas.filter(c => hasCritico(c)).length;

  // Hero: oldest coleta with pending results
  const proximoALaudar = coletas.find(c => getExamesPendentes(c).length > 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (loadError) {
    return <ErrorState title="Não foi possível carregar os laudos" error={loadError} onRetry={() => { setLoading(true); void fetchLaudos(); }} />;
  }

  return (
    <div className="space-y-6 pb-8">
      {/* ─── PageHeader ─── */}
      <PageHeader
        title="Laudos Laboratoriais"
        description={
          coletas.length > 0
            ? `${coletas.length} laudo${coletas.length === 1 ? '' : 's'} · ${totalPendentes} pendente${totalPendentes === 1 ? '' : 's'}${totalCriticos > 0 ? ` · ${totalCriticos} crítico${totalCriticos === 1 ? '' : 's'}` : ''}`
            : 'Validação e liberação de resultados'
        }
        icon={<FileText />}
        actions={
          <>
            <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
              <Link to="/laboratorio"><FlaskConical aria-hidden="true" className="h-4 w-4" /> Laboratório</Link>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={() => void fetchLaudos()}
              aria-label="Atualizar laudos"
              title="Atualizar laudos"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button asChild className="shrink-0 gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110">
              <Link to="/exames"><TestTube aria-hidden="true" className="h-4 w-4" /> Exames</Link>
            </Button>
          </>
        }
      />

      <LaboratorioSubnav />

      {/* ─── Indicator Strip ─── */}
      <section role="group" aria-label="Indicadores de laudos" className="space-y-2">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {([
            {
              key: 'pendente',
              label: 'Pendentes',
              value: totalPendentes,
              icon: Clock,
              escuro: true,
              color: 'text-white',
              surface: 'bg-white/15',
              caption: 'aguardando laudo',
            },
            {
              key: 'critico',
              label: 'Críticos',
              value: totalCriticos,
              icon: AlertCircle,
              escuro: false,
              color: 'text-destructive',
              surface: 'bg-destructive/10',
              caption: 'atenção imediata',
            },
            {
              key: 'parcial',
              label: 'Parciais',
              value: totalParciais,
              icon: AlertTriangle,
              escuro: false,
              color: 'text-warning-foreground',
              surface: 'bg-warning/10',
              caption: 'liberação parcial',
            },
            {
              key: 'liberado',
              label: 'Liberados',
              value: totalLiberados,
              icon: CheckCircle2,
              escuro: false,
              color: 'text-success',
              surface: 'bg-success/10',
              caption: 'concluídos',
            },
            {
              key: 'todos',
              label: 'Total',
              value: coletas.length,
              icon: FileText,
              escuro: false,
              color: 'text-[#1080CA]',
              surface: 'bg-[#1080CA]/10',
              caption: 'na worklist',
            },
          ] as const).map(s => {
            const Icon = s.icon;
            const ativo = statusFilter === s.key;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={ativo}
                onClick={() => setStatusFilter(ativo && s.key !== 'todos' ? 'todos' : s.key)}
                className={cn(
                  'group rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                  s.escuro && 'border-transparent bg-gradient-primary text-white',
                  ativo && !s.escuro && 'border-[#1080CA]/50 ring-1 ring-[#1080CA]/30',
                  ativo && s.escuro && 'ring-2 ring-[#1080CA]/60',
                )}
              >
                <div className="flex min-h-[96px] items-center gap-3 p-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.surface)}>
                    <Icon aria-hidden="true" className={cn('h-5 w-5', s.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className={cn('truncate text-xs font-semibold', s.escuro ? 'text-white/80' : 'text-foreground')}>{s.label}</h3>
                      <span className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</span>
                    </div>
                    <p className={cn('truncate text-[11px]', s.escuro ? 'text-white/60' : 'text-muted-foreground')}>{s.caption}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── Próximo a Laudar ─── */}
      {proximoALaudar && (
        <div
          className="rounded-2xl border border-[#1080CA]/30 bg-card p-4 shadow-[0_8px_24px_rgba(16,128,202,0.12)]"
          aria-label="Próxima coleta a laudar"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm">
                <FileSearch className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-[#1080CA] font-semibold">Próximo a laudar</p>
                <p className="text-lg font-bold truncate">
                  {proximoALaudar.pacientes?.nome_social?.trim() || proximoALaudar.pacientes?.nome || '—'}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {proximoALaudar.codigo_amostra}
                  {proximoALaudar.urgente && (
                    <Badge variant="destructive" className="ml-2 text-[10px] rounded-full">Urgente</Badge>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {getExamesPendentes(proximoALaudar).length} resultado{getExamesPendentes(proximoALaudar).length === 1 ? '' : 's'} pendente{getExamesPendentes(proximoALaudar).length === 1 ? '' : 's'} ·{' '}
                  {proximoALaudar.created_at
                    ? formatDistanceToNow(new Date(proximoALaudar.created_at), { locale: ptBR, addSuffix: true })
                    : '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {proximoALaudar.pacientes?.telefone && (() => {
                const waLink = linkWhatsApp(proximoALaudar.pacientes.telefone, `Olá, ${proximoALaudar.pacientes.nome_social?.trim() || proximoALaudar.pacientes.nome || 'paciente'}! Seu resultado de laboratório está em processamento. Em breve entraremos em contato.`);
                return waLink ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 rounded-full border-[#25D366]/40 text-[#25D366] hover:bg-[#25D366]/10 hover:text-[#25D366]"
                  >
                    <a href={waLink} target="_blank" rel="noopener noreferrer" aria-label="Contatar paciente via WhatsApp">
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  </Button>
                ) : null;
              })()}
              <Button
                size="sm"
                className="h-9 gap-1.5 rounded-full bg-gradient-primary text-white hover:brightness-110"
                onClick={() => setViewingId(proximoALaudar.id)}
              >
                <Eye className="h-3.5 w-3.5" /> Abrir Laudo
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Filters ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar laudos por paciente, CPF, telefone, código ou exame"
            className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]"
            placeholder="Nome, CPF, código ou exame..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Pill filters */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtros rápidos">
          {([
            { key: 'todos', label: 'Todos' },
            { key: 'pendente', label: 'Pendentes' },
            { key: 'parcial', label: 'Parciais' },
            { key: 'liberado', label: 'Liberados' },
            { key: 'alterado', label: 'Alterados' },
            { key: 'critico', label: 'Críticos' },
          ] as const).map(f => (
            <button
              key={f.key}
              type="button"
              aria-pressed={statusFilter === f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                'h-8 rounded-full border px-3 text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                statusFilter === f.key
                  ? 'border-transparent bg-gradient-primary text-white shadow-sm'
                  : 'border-border bg-background text-muted-foreground hover:border-[#9CC7EC] hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {temFiltro && (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-full text-muted-foreground" onClick={limparFiltros}>
            <X aria-hidden="true" className="h-3.5 w-3.5" /> Limpar filtros
          </Button>
        )}
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {filtradas.length} de {coletas.length} laudo{coletas.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* ─── Table ─── */}
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardContent className="p-0">
          {filtradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                <FileText className="h-7 w-7" />
              </span>
              <p className="font-medium text-foreground">
                {coletas.length > 0
                  ? 'Nenhum laudo corresponde à busca e ao status selecionados'
                  : hasOlderLaudos
                    ? 'Nenhum laudo encontrado entre os registros carregados'
                    : 'Ainda não há laudos registrados'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {coletas.length > 0 && temFiltro
                  ? 'Limpe os filtros para ver todos os laudos.'
                  : coletas.length === 0 && hasOlderLaudos
                    ? 'Carregue laudos anteriores para ampliar a busca.'
                    : 'Processe amostras no Laboratório para que os laudos apareçam aqui.'}
              </p>
              {coletas.length > 0 && temFiltro && (
                <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              )}
              {coletas.length === 0 && !hasOlderLaudos && (
                <Button asChild size="sm" className="mt-4 gap-2 rounded-full bg-gradient-primary text-white hover:brightness-110">
                  <Link to="/laboratorio"><FlaskConical className="h-4 w-4" /> Ir para Laboratório</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">#</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Código</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Paciente</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Exames</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Progresso</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Entrada</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Ações</th>
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
                    const critico = hasCritico(c);
                    const waLink = linkWhatsApp(
                      c.pacientes?.telefone,
                      `Olá, ${c.pacientes?.nome_social?.trim() || c.pacientes?.nome || 'paciente'}! Seu laudo laboratorial (${c.codigo_amostra}) está disponível. Entre em contato para mais informações.`,
                    );
                    return (
                      <tr
                        key={c.id}
                        className={cn(
                          'border-b border-border/50 last:border-0 transition-colors hover:bg-muted/20',
                          todoLiberado && 'opacity-60 hover:opacity-100',
                          c.urgente && 'bg-destructive/5',
                        )}
                      >
                        <td className="px-4 py-2.5">
                          <span className={cn(
                            'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                            idx === 0 ? 'bg-gradient-primary text-white' : 'bg-muted text-muted-foreground',
                          )}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[#1080CA] font-semibold">{c.codigo_amostra ?? '—'}</td>
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
                            {(c.resultados_laboratorio ?? []).slice(0, 2).map((r: any) => (
                              <Badge key={r.id} variant="secondary" className="text-[10px] rounded-full">{r.parametro ?? '—'}</Badge>
                            ))}
                            {total > 2 && <span className="text-[10px] text-muted-foreground">+{total - 2}</span>}
                            {alterado && <Badge variant="destructive" className="text-[10px] gap-0.5 rounded-full"><AlertTriangle className="h-2.5 w-2.5" />Alt.</Badge>}
                            {critico && <Badge variant="destructive" className="text-[10px] gap-0.5 rounded-full"><AlertCircle className="h-2.5 w-2.5" />Crítico</Badge>}
                            {hasCriticoPendente(c) && <Badge variant="destructive" className="text-[10px] rounded-full">Ciência pendente</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center gap-1.5 justify-center">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-[#1080CA] rounded-full transition-all"
                                style={{ width: `${total > 0 ? (liberados.length / total) * 100 : 0}%` }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{liberados.length}/{total}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {todoLiberado ? (
                            <Badge className="bg-success/10 text-success border-success/20 text-[10px] rounded-full">Liberado</Badge>
                          ) : parcial ? (
                            <Badge className="bg-warning/10 text-warning-foreground border-warning/20 text-[10px] rounded-full">Parcial</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] rounded-full">Pendente</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">
                          {c.created_at ? formatDistanceToNow(new Date(c.created_at), { locale: ptBR, addSuffix: true }) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {waLink && (
                              <Button
                                asChild
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 rounded-full p-0 text-[#25D366] hover:bg-[#25D366]/10"
                                aria-label={`Contatar ${c.pacientes?.nome || 'paciente'} via WhatsApp`}
                              >
                                <a href={waLink} target="_blank" rel="noopener noreferrer">
                                  <MessageCircle className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 rounded-full text-xs gap-1"
                              onClick={() => setViewingId(c.id)}
                            >
                              <Eye className="h-3 w-3" /> Ver Laudo
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Load more ─── */}
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
            className="gap-2 rounded-full"
            onClick={() => void carregarLaudosAntigos()}
            disabled={loadingOlderLaudos}
          >
            {loadingOlderLaudos && <Loader2 className="h-4 w-4 animate-spin" />}
            {loadingOlderLaudos ? 'Carregando...' : 'Carregar laudos anteriores'}
          </Button>
        </div>
      )}

      {/* ─── Cross-links ─── */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
        <p className="w-full text-xs text-muted-foreground mb-1">Fluxo do laboratório:</p>
        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
          <Link to="/laboratorio"><FlaskConical className="h-3.5 w-3.5" /> Worklist</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
          <Link to="/exames"><TestTube className="h-3.5 w-3.5" /> Exames</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
          <Link to="/guias-externas"><FileSearch className="h-3.5 w-3.5" /> Guias Externas</Link>
        </Button>
      </div>

      <LaudoDetalheModal coletaId={viewingId} onClose={() => setViewingId(null)} onUpdate={() => void fetchLaudos()} />
    </div>
  );
}
