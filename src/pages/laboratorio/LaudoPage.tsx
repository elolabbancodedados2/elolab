import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, CheckCircle2, AlertCircle, Loader2, AlertTriangle, Clock, Download, Printer, Shield, Activity, History, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { notificarResultadoLiberado } from '@/lib/notificarResultado';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';

import { cn } from '@/lib/utils';
import { printLaudoPDF, downloadLaudoPDF, LaudoData } from '@/lib/pdfGenerator';

import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';

import { formatDateTimeSaoPaulo } from '@/lib/dateOnly';
import { parseResultadoNumerico, deveNotificarRetificacao, formatarReferenciaLaudo, perfilPodeRetificarResultado, podeRetificarResultado, procedenciaResultadoLaudo, trilhaDeVersoes } from '@/lib/laudoWorkflow';

import { criticalAcknowledgementIsPending } from '@/lib/criticalResultAcknowledgement';
import { STATUS_COLETA_LABELS } from '@/lib/laboratorioWorkflow';

import { Link, useLocation, useParams } from 'react-router-dom';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { PageHeader } from '@/components/PageHeader';

export default function LaudoPage() {
  const { coletaId } = useParams();
  const { profile } = useSupabaseAuth();
  return <LaudoWorkspace key={`${profile?.clinica_id}:${coletaId}`} coletaId={coletaId ?? null} />;
}

function LaudoWorkspace({ coletaId }: { coletaId: string | null }) {
  const location = useLocation();
  const completed = useRef(false);
  const retificacaoInicial = useRef('');
  const { profile } = useSupabaseAuth();
  const [coleta, setColeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [unavailable, setUnavailable] = useState(false);
  const fetchRequestRef = useRef(0);
  const [isValidating, setIsValidating] = useState(false);
  const [isReleasingAll, setIsReleasingAll] = useState(false);
  const [releasingIds, setReleasingIds] = useState<Set<string>>(new Set());
  const [observacaoLaudo, setObservacaoLaudo] = useState('');
  const [retificacao, setRetificacao] = useState<null | { id: string; parametro: string; resultado: string; unidade: string; referenciaMin: string; referenciaMax: string; referenciaTexto: string; metodo: string; critico: boolean; motivo: string; liberado: boolean }>(null);
  const [historicoResultadoId, setHistoricoResultadoId] = useState<string | null>(null);
  const [historicoResultado, setHistoricoResultado] = useState<any[]>([]);
  const [erroHistorico, setErroHistorico] = useState<unknown>(null);
  const historyRequest = useRef(0);
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
    setUnavailable(false);
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
      if (requestId !== fetchRequestRef.current) return;
      if (!data) { setUnavailable(true); return; }
      setColeta(data);
    } catch (error) {
      if (requestId === fetchRequestRef.current) setLoadError(error);
    } finally {
      if (requestId === fetchRequestRef.current) setLoading(false);
    }
  }, [coletaId, profile?.clinica_id]);

  const abrirRetificacao = (res: any) => {
    const draft = {
    id: res.id, parametro: String(res.parametro ?? ''), resultado: String(res.resultado ?? ''),
    unidade: String(res.unidade ?? ''), referenciaMin: res.valor_referencia_min == null ? '' : String(res.valor_referencia_min),
    referenciaMax: res.valor_referencia_max == null ? '' : String(res.valor_referencia_max),
    referenciaTexto: String(res.valor_referencia_texto ?? ''), metodo: String(res.metodo ?? ''),
    critico: !!res.critico, motivo: '', liberado: res.liberado === true,
    };
    retificacaoInicial.current = JSON.stringify(draft);
    setRetificacao(draft);
  };

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
      setRetificacao(null); await fetchData();
      if (historicoResultadoId === retificacao.id) await carregarHistorico(retificacao.id, true);
    } catch (error) { toast.error('Não foi possível retificar o resultado.', { description: mensagemDeErro(error) }); }
    finally { setSalvandoRetificacao(false); }
  };

  async function carregarHistorico(resultadoId: string, refresh = false) {
    if (!profile?.clinica_id) return;
    const request = ++historyRequest.current;
    if (!refresh && historicoResultadoId === resultadoId) { setHistoricoResultadoId(null); return; }
    setHistoricoResultadoId(resultadoId); setCarregandoHistorico(true); setHistoricoResultado([]); setErroHistorico(null);
    try {
      const { data, error } = await (supabase as any).from('resultados_laboratorio_versoes')
        .select('id, numero_versao, registro_anterior, motivo, alterado_por, alterado_em, autor:profiles!resultados_laboratorio_versoes_alterado_por_fkey(nome)')
        .eq('clinica_id', profile.clinica_id).eq('resultado_id', resultadoId).order('numero_versao', { ascending: false });
      if (error) throw error;
      if (request === historyRequest.current) setHistoricoResultado(data ?? []);
    } catch (error) { if (request === historyRequest.current) setErroHistorico(error); }
    finally { if (request === historyRequest.current) setCarregandoHistorico(false); }
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
     
    } catch (err: any) {
      console.error('handleLiberarTodos error:', err);
      toast.error('Erro ao liberar em lote: ' + (err?.message || 'Erro desconhecido'));
    } finally {
      setIsReleasingAll(false);
    }
  };

  const handleValidarColeta = async () => {
    if (isBusy) return;
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
    const previewWindow = window.open('about:blank', '_blank');
    if (!previewWindow) { toast.error('Permita a abertura do PDF para imprimir o laudo.'); return; }
    previewWindow.document.title = 'Preparando laudo';
    previewWindow.document.body.textContent = 'Preparando PDF…';
    try {
      const laudoData = buildLaudoData();
      if (!laudoData) { previewWindow.close(); return; }
      await printLaudoPDF(laudoData, previewWindow);
    } catch (err: any) {
      previewWindow.close();
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

  const dirty = !!observacaoLaudo.trim() || Object.values(condutasCiencia).some(value => !!value.trim()) || (retificacao !== null && JSON.stringify(retificacao) !== retificacaoInicial.current);
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-24 lg:pb-8">
      <UnsavedChangesGuard dirty={dirty} busy={isBusy} completed={completed} />
      <PageHeader title={`Laudo — ${coleta?.codigo_amostra ?? 'conferência'}`} icon={<FileText className="h-5 w-5" />} description="Conferência técnica, liberação e rastreabilidade dos resultados." actions={<Button asChild variant="outline"><Link to="/laudos-lab" state={{ laudoFilters: location.state?.laudoFilters }}>Voltar aos laudos</Link></Button>} />
      {coleta && <div className="flex flex-wrap gap-2"><Badge variant="outline">{STATUS_COLETA_LABELS[coleta.status] || coleta.status}</Badge>{coleta.urgente && <Badge variant="destructive">Urgente</Badge>}</div>}
      <fieldset disabled={isBusy} className="min-w-0 space-y-5" aria-busy={isBusy}>
        {loading ? (
          <div role="status" aria-label="Carregando laudo" className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : loadError ? (
          <ErrorState error={loadError} title="Não foi possível carregar este laudo" onRetry={() => void fetchData()} />
        ) : unavailable ? (
          <section className="space-y-3 py-6"><h2 className="text-lg font-semibold">Laudo indisponível</h2><p className="text-sm text-muted-foreground">A coleta não foi encontrada ou não está acessível nesta clínica.</p><Button variant="outline" onClick={() => void fetchData()}>Tentar novamente</Button></section>
        ) : coleta ? (
          <div className="space-y-5">
            {/* Patient info */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y py-5 lg:grid-cols-5">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Paciente</p>
                <p className="font-semibold break-words">{coleta.pacientes?.nome_social?.trim() || coleta.pacientes?.nome || '—'}</p>
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
            <div className="flex items-center gap-3 border-b pb-4">
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
            <div className="divide-y border-y">
              {totalResults === 0 && <div className="py-6"><h2 className="font-semibold">Nenhum resultado registrado</h2><p className="mt-1 text-sm text-muted-foreground">Registre os resultados da amostra antes da conferência e liberação.</p><Button asChild variant="outline" className="mt-3"><Link to={`/laboratorio/coletas/${coletaId}/resultados`}>Registrar resultados</Link></Button></div>}
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
                    'py-5 space-y-3',
                    res.liberado ? 'border-l-2 border-l-success pl-3' : '',
                    (isAltered || res.critico) && !res.liberado ? 'border-l-2 border-l-destructive pl-3' : '',
                  )}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div data-testid="laudo-result-title" className="min-w-0">
                        <p className="font-semibold text-sm">{res.parametro ?? '—'}</p>
                        <p className="text-[11px] text-muted-foreground">{res.exames?.tipo_exame ?? '—'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {procedenciaResultadoLaudo({ metodo: res.metodo, equipamento: res.equipamento, laboratorio: res.exames?.laboratorios?.nome ?? 'própria clínica' })}
                        </p>
                      </div>
                      <div data-testid="laudo-result-badges" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                        {isAltered && <Badge variant="destructive" className="max-w-full whitespace-normal text-left text-[10px] gap-1 rounded-full"><AlertTriangle className="h-2.5 w-2.5 shrink-0" />Alterado</Badge>}
                        {res.critico && <Badge variant="destructive" className="max-w-full whitespace-normal text-left text-[10px] gap-1 rounded-full"><AlertCircle className="h-2.5 w-2.5 shrink-0" />Crítico · revisão prioritária</Badge>}
                        {res.critico && <Badge variant={cienciaCriticaPendente ? 'destructive' : 'secondary'} className="max-w-full whitespace-normal text-left text-[10px] rounded-full">
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
                            <div className="flex flex-wrap items-center justify-between gap-3">
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
                      {podeRetificarResultado(coleta.status, res.liberado === true) && podeRetificarLiberado && <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={retificacao !== null && retificacao.id !== res.id} onClick={() => abrirRetificacao(res)}><PencilLine className="h-3.5 w-3.5" />{res.liberado ? 'Retificar laudo' : 'Corrigir resultado'}</Button>}
                    </div>
                    {historicoResultadoId === res.id && <div className="space-y-2 rounded-md bg-muted/40 p-3 text-xs">
                      {carregandoHistorico ? <p role="status">Carregando versões…</p> : erroHistorico ? <ErrorState compact description="Não foi possível carregar as versões deste resultado." error={erroHistorico} onRetry={() => void carregarHistorico(res.id, true)} /> : historicoResultado.length === 0 ? <p>Nenhuma versão anterior registrada.</p> : trilhaDeVersoes(historicoResultado, res).map((versao) => <div key={versao.id} className="border-b pb-2 last:border-0"><p className="font-medium">Versão {versao.numero_versao} → {versao.numero_versao + 1} · {formatDateTimeSaoPaulo(versao.alterado_em)} · {versao.autor?.nome || 'autor não identificado'}</p><p>Resultado anterior: {versao.registro_anterior?.resultado ?? '—'} {versao.registro_anterior?.unidade ?? ''}</p>{versao.alteracoes.length > 0 ? <ul className="list-disc pl-4">{versao.alteracoes.map((alteracao) => <li key={alteracao}>{alteracao}</li>)}</ul> : <p className="text-muted-foreground">Sem mudança nos campos do laudo.</p>}{versao.motivo && <p>Motivo: {versao.motivo}</p>}</div>)}
                    </div>}
                    {retificacao?.id === res.id && <div className="mt-2 space-y-3 rounded-md border border-warning/30 bg-warning/5 p-3">
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
              <Label htmlFor="observacoes-laudo" className="text-xs">Observações para impressão</Label>
              <p id="observacoes-laudo-ajuda" className="text-xs text-muted-foreground">Incluídas apenas no PDF desta sessão; não alteram o registro clínico.</p>
              <Textarea id="observacoes-laudo" aria-describedby="observacoes-laudo-ajuda" value={observacaoLaudo} onChange={e => setObservacaoLaudo(e.target.value)}
                placeholder="Observações técnicas para o laudo impresso..." rows={2} />
            </div>
          </div>
        ) : null}

        {/* Footer actions */}
        {coleta && (
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4 scroll-mb-24">
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
          </div>
        )}
      </fieldset>
    </div>
  );
}

