import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, BellRing, FileDown, FileStack, ListPlus, Plus, RefreshCw, ShieldCheck, RotateCcw, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { ErrorState } from '@/components/ErrorState';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mesmoValor } from '@/lib/dinheiro';
import { mensagemDeErro } from '@/lib/erros';
import { PageHeader } from '@/components/PageHeader';
import { FieldHelp } from '@/components/ContextualHelp';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { RelatorioFaturamentoCompetencia } from '@/components/financeiro/RelatorioFaturamentoCompetencia';
import { ConciliacaoConvenioPorLote } from '@/components/financeiro/ConciliacaoConvenioPorLote';
import { GuiasPorAutorizacao } from '@/components/financeiro/GuiasPorAutorizacao';
import { FilaAutorizacoesConvenio } from '@/components/financeiro/FilaAutorizacoesConvenio';
import { RecursoGlosaEmLoteDialog, type DadosRecursoEmLote } from '@/components/financeiro/RecursoGlosaEmLoteDialog';
import { ResumoRecurso, type DocumentoRecurso } from '@/components/financeiro/ResumoRecursoGlosa';
import { bloqueiaEnvio, validarLoteTiss, type AutorizacaoValidacao, type GuiaLote } from '@/lib/tissLoteValidacao';
import { buscarDadosBasicosPacientes } from '@/lib/patientBasicData';
import { formatarCompetencia, rotuloStatusGlosa, rotuloStatusLote, STATUS_GLOSA_LABEL, STATUS_LOTE_LABEL } from '@/lib/tissStatus';
import { alertasFaturamento } from '@/lib/alertasFaturamento';
import { executarEmSequencia, podePrepararRecurso, prontaParaEnvio } from '@/lib/glosaLote';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
// Cor só para o que pede atenção; os demais status ficam neutros.
const STATUS_LOTE_COR: Record<string, string> = {
  pago_parcial: 'border-warning/30 bg-warning/10 text-warning-foreground',
  pago: 'border-success/30 bg-success/10 text-success',
  rejeitado: 'border-destructive/30 bg-destructive/10 text-destructive',
  cancelado: 'border-border bg-muted text-muted-foreground',
};
const STATUS_GLOSA_COR: Record<string, string> = {
  pendente: 'border-warning/30 bg-warning/10 text-warning-foreground',
  aceita: 'border-success/30 bg-success/10 text-success',
  mantida: 'border-destructive/30 bg-destructive/10 text-destructive',
  cancelada: 'border-border bg-muted text-muted-foreground',
};
const COLUNAS_GUIA = 'id,lote_id,numero_guia,numero_carteira,paciente_id,autorizacao_id,data_atendimento,codigo_procedimento,tipo_servico,quantidade,valor_total';
const PILULAS_LOTE = [{ value: 'todos', label: 'Todos' }, ...Object.entries(STATUS_LOTE_LABEL).map(([value, label]) => ({ value, label }))];
const PILULAS_GLOSA = [{ value: 'todos', label: 'Todas' }, ...Object.entries(STATUS_GLOSA_LABEL).map(([value, label]) => ({ value, label }))];
const pilulaClasse = (ativo: boolean) => cn(
  'min-h-11 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  ativo ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground',
);
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('pt-BR');

const escapeXml = (v: unknown) => String(v ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
interface FiltrosFaturamento { tab?: string; buscaLote?: string; statusLote?: string; buscaGlosa?: string; statusGlosa?: string }
interface EstadoFaturamento { restaurarFiltros?: FiltrosFaturamento }

/** Erro de uma consulta auxiliar: fica dentro da aba, sem derrubar a tela inteira. */
function ErroCompacto({ titulo, onRetry }: { titulo: string; onRetry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
    <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{titulo}</span>
    <Button size="sm" variant="outline" className="min-h-11 rounded-full" onClick={onRetry}>Tentar de novo</Button>
  </div>;
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <div><p className="text-[11px] text-muted-foreground">{rotulo}</p><div className="text-sm">{children}</div></div>;
}

export default function FaturamentoConvenios() {
  const { profile } = useSupabaseAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loteParaConfirmarEnvio, setLoteParaConfirmarEnvio] = useState<any | null>(null);
  const [loteEnviandoId, setLoteEnviandoId] = useState<string | null>(null);
  const [glosaAtualizandoId, setGlosaAtualizandoId] = useState<string | null>(null);
  const glosaAtualizacaoLock = useRef(false);
  const filtrosRestaurados = (location.state as EstadoFaturamento | null)?.restaurarFiltros;
  const [activeTab, setActiveTab] = useState(filtrosRestaurados?.tab ?? 'lotes');
  const [buscaLote, setBuscaLote] = useState(filtrosRestaurados?.buscaLote ?? '');
  const [statusLote, setStatusLote] = useState(filtrosRestaurados?.statusLote ?? 'todos');
  const [buscaGlosa, setBuscaGlosa] = useState(filtrosRestaurados?.buscaGlosa ?? '');
  const [statusGlosa, setStatusGlosa] = useState(filtrosRestaurados?.statusGlosa ?? 'todos');
  const [competenciaResumo, setCompetenciaResumo] = useState('todas');
  const [convenioResumo, setConvenioResumo] = useState('todos');
  const [glosasSelecionadas, setGlosasSelecionadas] = useState<Set<string>>(new Set());
  const [recursoEmLoteAberto, setRecursoEmLoteAberto] = useState(false);
  const [processandoLote, setProcessandoLote] = useState(false);
  const hoje = todaySaoPauloDateOnly();
  const filtrosAtuais = { tab: activeTab, buscaLote, statusLote, buscaGlosa, statusGlosa };

  const conveniosQuery = useQuery({ queryKey: ['convenios-faturamento', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    const { data, error } = await supabase.from('convenios').select('id,nome,versao_tiss').eq('clinica_id', profile?.clinica_id ?? '').eq('ativo', true).order('nome');
    if (error) throw error; return data ?? [];
  }});
  const convenios = conveniosQuery.data ?? [];
  const lotesQuery = useQuery({ queryKey: ['lotes-tiss', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    return buscarEmBlocos<any>(() => (supabase as any).from('lotes_tiss').select('*,convenios(nome,registro_ans)')
      .eq('clinica_id', profile?.clinica_id ?? '').order('competencia', { ascending: false }).order('id', { ascending: true }));
  }});
  const lotes = lotesQuery.data ?? [];
  const lotesComNomeConvenio = useMemo(() => lotes.map((l: any) => ({ ...l, convenio_nome: l.convenios?.nome ?? 'Convênio sem nome' })), [lotes]);
  const lotesComDivergenciaFinanceira = lotes.filter((lote: any) =>
    !mesmoValor(Number(lote.valor_pago || 0), Number(lote.valor_conciliado_financeiro || 0)),
  );
  const lotesParaRegistrarGlosa = lotes.filter((lote: any) => ['enviado', 'processando', 'pago_parcial', 'pago'].includes(lote.status));
  const glosasQuery = useQuery({ queryKey: ['glosas-convenio', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    return buscarEmBlocos<any>(() => (supabase as any).from('glosas_convenio').select('*,lotes_tiss(numero_lote,convenios(nome))')
      .eq('clinica_id', profile?.clinica_id ?? '').order('created_at', { ascending: false }).order('id', { ascending: true }));
  }});
  const glosas = glosasQuery.data ?? [];
  const guiasQuery = useQuery({ queryKey: ['lotes-tiss', 'guias', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    return buscarEmBlocos<GuiaLote & { lote_id: string }>(() => supabase.from('lote_tiss_guias').select(COLUNAS_GUIA)
      .eq('clinica_id', profile?.clinica_id ?? '').order('created_at', { ascending: true }).order('id', { ascending: true }));
  }});
  const autorizacoesQuery = useQuery({ queryKey: ['autorizacoes-faturamento', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    const autorizacoes = await buscarEmBlocos<AutorizacaoValidacao & { data_solicitacao?: string | null }>(() => supabase.from('autorizacoes_convenio')
      .select('id,status,convenio_id,paciente_id,tipo_servico,data_expiracao,numero_autorizacao,data_solicitacao')
      .eq('clinica_id', profile?.clinica_id ?? '').order('data_solicitacao', { ascending: false }).order('id', { ascending: true }));
    const pacientes = await buscarDadosBasicosPacientes([...new Set(autorizacoes.map(a => a.paciente_id))]);
    return autorizacoes.map(a => ({ ...a, paciente_nome: pacientes.get(a.paciente_id)?.nome ?? null }));
  }});
  const responsaveisQuery = useQuery({ queryKey: ['responsaveis-financeiro', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    const { data, error } = await supabase.rpc('listar_responsaveis_financeiro');
    if (error) throw error; return data ?? [];
  }});
  const documentosQuery = useQuery({ queryKey: ['glosa-recurso-documentos', profile?.clinica_id ?? null], enabled: !!profile?.clinica_id, queryFn: async () => {
    return buscarEmBlocos<DocumentoRecurso>(() => supabase.from('glosa_recurso_documentos').select('id,glosa_id,storage_path,file_name,created_at')
      .eq('clinica_id', profile?.clinica_id ?? '').order('created_at', { ascending: true }).order('id', { ascending: true }));
  }});
  const documentosPorGlosa = useMemo(() => {
    const mapa = new Map<string, DocumentoRecurso[]>();
    for (const d of documentosQuery.data ?? []) mapa.set(d.glosa_id, [...(mapa.get(d.glosa_id) ?? []), d]);
    return mapa;
  }, [documentosQuery.data]);
  const guiasPorLote = useMemo(() => {
    const mapa = new Map<string, GuiaLote[]>();
    for (const guia of guiasQuery.data ?? []) mapa.set(guia.lote_id, [...(mapa.get(guia.lote_id) ?? []), guia]);
    return mapa;
  }, [guiasQuery.data]);
  const pendenciasPorLote = useMemo(() => {
    return new Map(lotes.map((lote: any) => [lote.id, validarLoteTiss({
      lote, registroAns: lote.convenios?.registro_ans ?? null, guias: guiasPorLote.get(lote.id) ?? [],
      autorizacoes: autorizacoesQuery.data ?? [], hoje,
    })]));
  }, [lotes, guiasPorLote, autorizacoesQuery.data, hoje]);
  // Sem as guias carregadas não dá para validar o lote: o envio fica bloqueado até a consulta voltar.
  // Lote antigo, sem guias, segue o fluxo agregado: o banco também só bloqueia lotes com guias.
  const envioBloqueado = (loteId: string) => guiasQuery.isError || autorizacoesQuery.isError || guiasQuery.isLoading || autorizacoesQuery.isLoading
    || ((guiasPorLote.get(loteId)?.length ?? 0) > 0 && bloqueiaEnvio(pendenciasPorLote.get(loteId) ?? []));
  const consultasAtingiramLimite = lotes.length >= LIMITE_BUSCA_EM_BLOCOS
    || glosas.length >= LIMITE_BUSCA_EM_BLOCOS;
  const isLoading = conveniosQuery.isLoading || lotesQuery.isLoading;

  const alertas = useMemo(() => alertasFaturamento({
    glosas, lotes, autorizacoes: autorizacoesQuery.data ?? [], hoje,
  }), [glosas, lotes, autorizacoesQuery.data, hoje]);
  const [alertasExpandidos, setAlertasExpandidos] = useState(false);

  const competenciasDisponiveis = useMemo(() => [...new Set(lotes.map((l: any) => String(l.competencia || '').slice(0, 7)).filter(Boolean))].sort().reverse() as string[], [lotes]);
  // Os indicadores seguem a competência e o convênio escolhidos acima deles.
  const resumo = useMemo(() => {
    const lotesDoResumo = lotes.filter((l: any) =>
      (competenciaResumo === 'todas' || String(l.competencia || '').startsWith(competenciaResumo))
      && (convenioResumo === 'todos' || l.convenio_id === convenioResumo));
    const idsLotes = new Set(lotesDoResumo.map((l: any) => l.id));
    const glosasDoResumo = glosas.filter((g: any) => idsLotes.has(g.lote_id) && g.status !== 'cancelada');
    return {
      apresentado: lotesDoResumo.filter((l: any) => ['enviado', 'processando', 'pago_parcial', 'pago', 'rejeitado'].includes(l.status))
        .reduce((s: number, l: any) => s + Number(l.valor_apresentado || 0), 0),
      pago: lotesDoResumo.filter((l: any) => !['cancelado', 'rejeitado'].includes(l.status))
        .reduce((s: number, l: any) => s + Number(l.valor_pago || 0), 0),
      glosado: glosasDoResumo.reduce((s: number, g: any) => s + Number(g.valor_glosado || 0), 0),
      recuperado: glosasDoResumo.reduce((s: number, g: any) => s + Number(g.valor_recuperado || 0), 0),
    };
  }, [lotes, glosas, competenciaResumo, convenioResumo]);

  const lotesFiltrados = useMemo(() => {
    const termo = normalizar(buscaLote);
    return lotes.filter((lote: any) => {
      const texto = normalizar([lote.numero_lote, lote.convenios?.nome, lote.competencia, formatarCompetencia(lote.competencia), rotuloStatusLote(lote.status)]
        .filter(Boolean).join(' '));
      return (!termo || texto.includes(termo)) && (statusLote === 'todos' || lote.status === statusLote);
    });
  }, [lotes, buscaLote, statusLote]);

  const glosasFiltradas = useMemo(() => {
    const termo = normalizar(buscaGlosa);
    return glosas.filter((glosa: any) => {
      const texto = normalizar([glosa.codigo_glosa, glosa.guia_referencia, glosa.motivo, glosa.lotes_tiss?.numero_lote, glosa.lotes_tiss?.convenios?.nome]
        .filter(Boolean).join(' '));
      return (!termo || texto.includes(termo)) && (statusGlosa === 'todos' || glosa.status === statusGlosa);
    });
  }, [glosas, buscaGlosa, statusGlosa]);

  const glosasEmAberto = glosas.filter((g: any) => ['pendente', 'recurso_preparacao', 'recurso_enviado'].includes(g.status)).length;
  const lotesRascunho = lotes.filter((l: any) => l.status === 'rascunho').length;
  const contarLotes = (status: string) => status === 'todos' ? lotes.length : lotes.filter((l: any) => l.status === status).length;
  const contarGlosas = (status: string) => status === 'todos' ? glosas.length : glosas.filter((g: any) => g.status === status).length;
  const filtroLoteAtivo = !!buscaLote.trim() || statusLote !== 'todos';
  const filtroGlosaAtivo = !!buscaGlosa.trim() || statusGlosa !== 'todos';
  const consultas = [conveniosQuery, lotesQuery, glosasQuery, guiasQuery, autorizacoesQuery, documentosQuery, responsaveisQuery];
  const atualizando = consultas.some(q => q.isFetching);
  const atualizarTudo = () => { for (const consulta of consultas) void consulta.refetch(); };

  const selecionadas = glosas.filter((g: any) => glosasSelecionadas.has(g.id));
  const selecionadasParaPreparar = selecionadas.filter(podePrepararRecurso);
  const selecionadasParaEnvio = selecionadas.filter(prontaParaEnvio);
  const alternarGlosa = (id: string, marcada: boolean) => setGlosasSelecionadas(atual => {
    const proximo = new Set(atual);
    if (marcada) proximo.add(id); else proximo.delete(id);
    return proximo;
  });
  const elegiveisVisiveis = glosasFiltradas.filter(podePrepararRecurso);
  const todasVisiveisMarcadas = elegiveisVisiveis.length > 0 && elegiveisVisiveis.every((g: any) => glosasSelecionadas.has(g.id));

  async function updateLot(id: string): Promise<boolean> {
    if (loteEnviandoId) return false;
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Atualize a sessão e tente novamente.'); return false; }
    setLoteEnviandoId(id);
    try {
      const { data, error } = await (supabase as any).rpc('registrar_envio_lote_tiss', { p_lote_id: id });
      if (error) throw error;
      if (!data?.success) throw new Error('O lote já foi alterado. Atualize a lista antes de registrar o envio.');
      await queryClient.invalidateQueries({ queryKey: ['lotes-tiss'] }); toast.success('Envio registrado.');
      return true;
    } catch (error) { toast.error('Não foi possível atualizar o lote.', { description: mensagemDeErro(error) }); return false; }
    finally { setLoteEnviandoId(null); }
  }

  async function marcarRecursoEnviado(id: string) {
    const { data, error } = await (supabase as any).rpc('atualizar_glosa_convenio', {
      p_glosa_id: id,
      p_status: 'recurso_enviado',
      p_recurso_justificativa: null,
      p_valor_recuperado: null,
    });
    if (error) throw error;
    if (!data?.success) throw new Error('A glosa já mudou de status. Atualize a lista antes de continuar.');
  }

  async function updateGlosa(id: string) {
    if (!profile?.clinica_id) { toast.error('Clínica não identificada. Atualize a sessão e tente novamente.'); return false; }
    if (glosaAtualizacaoLock.current) return false;
    const atual = glosas.find((item: any) => item.id === id);
    if (!atual || !prontaParaEnvio(atual)) {
      toast.error('Atualize o recurso e confirme justificativa, prazo e responsável antes de marcar como enviado.');
      return false;
    }
    glosaAtualizacaoLock.current = true;
    setGlosaAtualizandoId(id);
    try {
      await marcarRecursoEnviado(id);
      await queryClient.invalidateQueries({ queryKey: ['glosas-convenio'] });
      toast.success('Recurso marcado como enviado.');
      return true;
    } catch (error) { toast.error('Não foi possível atualizar a glosa.', { description: mensagemDeErro(error) }); }
    finally {
      glosaAtualizacaoLock.current = false;
      setGlosaAtualizandoId(null);
    }
    return false;
  }

  function avisarResultadoLote(acao: string, resultado: { concluidas: string[]; falhas: { id: string; erro: unknown }[] }) {
    if (resultado.falhas.length === 0) toast.success(`${resultado.concluidas.length} ${acao}.`);
    else toast.error(`${resultado.concluidas.length} ${acao}; ${resultado.falhas.length} não puderam ser atualizada(s).`, { description: mensagemDeErro(resultado.falhas[0].erro) });
    setGlosasSelecionadas(new Set(resultado.falhas.map(f => f.id)));
  }

  async function marcarSelecionadasEnviadas() {
    if (processandoLote || glosaAtualizacaoLock.current || selecionadasParaEnvio.length === 0) return;
    glosaAtualizacaoLock.current = true;
    setProcessandoLote(true);
    try {
      const resultado = await executarEmSequencia(selecionadasParaEnvio.map((g: any) => g.id), marcarRecursoEnviado);
      await queryClient.invalidateQueries({ queryKey: ['glosas-convenio'] });
      avisarResultadoLote('recurso(s) marcado(s) como enviado(s)', resultado);
    } finally {
      glosaAtualizacaoLock.current = false;
      setProcessandoLote(false);
    }
  }

  async function prepararRecursoEmLote(dados: DadosRecursoEmLote) {
    if (processandoLote || glosaAtualizacaoLock.current) return;
    glosaAtualizacaoLock.current = true;
    setProcessandoLote(true);
    try {
      const resultado = await executarEmSequencia(selecionadasParaPreparar.map((g: any) => g.id), async id => {
        const { data, error } = await (supabase as any).rpc('atualizar_glosa_convenio', {
          p_glosa_id: id, p_status: 'recurso_preparacao', p_recurso_justificativa: dados.justificativa, p_valor_recuperado: null,
        });
        if (error) throw error;
        if (!data?.success) throw new Error('A glosa mudou de status. Atualize a lista antes de continuar.');
        const { error: prazoError } = await supabase.rpc('definir_recurso_glosa', { p_glosa_id: id, p_prazo: dados.prazo, p_responsavel_id: dados.responsavelId });
        if (prazoError) throw prazoError;
      });
      await queryClient.invalidateQueries({ queryKey: ['glosas-convenio'] });
      avisarResultadoLote('recurso(s) preparado(s)', resultado);
      if (resultado.falhas.length === 0) setRecursoEmLoteAberto(false);
    } finally {
      glosaAtualizacaoLock.current = false;
      setProcessandoLote(false);
    }
  }

  function exportLot(lote: any) {
    if (envioBloqueado(lote.id)) {
      toast.error('Corrija as pendências do lote antes de exportar.', { description: 'Cada guia e campo a corrigir está listado na conferência de guias.' });
      void navigate(`/faturamento-convenios/lotes/${lote.id}/guias`, { state: { filtros: filtrosAtuais } });
      return;
    }
    const guiasXml = (guiasPorLote.get(lote.id) ?? []).map(g => `<guia><numero>${escapeXml(g.numero_guia)}</numero><carteira>${escapeXml(g.numero_carteira)}</carteira><dataAtendimento>${escapeXml(g.data_atendimento)}</dataAtendimento><procedimento>${escapeXml(g.codigo_procedimento)}</procedimento><quantidade>${g.quantidade}</quantidade><valor>${Number(g.valor_total).toFixed(2)}</valor></guia>`).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Resumo operacional EloLab; não é arquivo TISS de transmissão. -->\n<loteOperacional versaoTISS="${escapeXml(lote.versao_tiss)}"><numero>${escapeXml(lote.numero_lote)}</numero><competencia>${escapeXml(lote.competencia)}</competencia><registroANS>${escapeXml(lote.convenios?.registro_ans)}</registroANS><quantidadeGuias>${lote.quantidade_guias}</quantidadeGuias><valorApresentado>${Number(lote.valor_apresentado).toFixed(2)}</valorApresentado>${guiasXml ? `<guias>${guiasXml}</guias>` : ''}</loteOperacional>`;
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' })); const a = document.createElement('a'); a.href = url; a.download = `resumo-operacional-lote-${lote.numero_lote}.xml`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const abrirGuias = (l: any) => navigate('/faturamento-convenios/lotes/' + l.id + '/guias', { state: { filtros: filtrosAtuais } });
  const abrirRecurso = (g: any) => navigate('/faturamento-convenios/glosas/' + g.id + '/recurso', { state: { filtros: filtrosAtuais } });
  const abrirRetornoGlosa = (g: any) => navigate('/faturamento-convenios/glosas/' + g.id + '/retorno', { state: { filtros: filtrosAtuais } });
  const errosDoLote = (loteId: string) => (pendenciasPorLote.get(loteId) ?? []).filter(p => p.gravidade === 'erro').length;

  const acoesLote = (l: any) => <div className="flex flex-wrap gap-1">
    <Button size="sm" variant="outline" className="min-h-11 rounded-full text-xs" onClick={() => abrirGuias(l)} aria-label={`Conferir guias do lote ${l.numero_lote}`}>Guias ({guiasPorLote.get(l.id)?.length ?? 0})</Button>
    <Button size="sm" variant="ghost" className="min-h-11 rounded-full text-xs" onClick={() => exportLot(l)} aria-label={`Baixar resumo XML do lote ${l.numero_lote}`} title="Baixar resumo operacional XML (não é arquivo TISS de transmissão)"><FileDown className="mr-1 h-4 w-4" />Baixar resumo XML</Button>
    {l.status === 'rascunho' && <Button size="sm" className="min-h-11 rounded-full text-xs" disabled={loteEnviandoId !== null || envioBloqueado(l.id)} title={envioBloqueado(l.id) ? 'Corrija as pendências das guias antes de registrar o envio' : undefined} onClick={() => setLoteParaConfirmarEnvio(l)}>{loteEnviandoId === l.id && <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />}Registrar envio</Button>}
    {['enviado', 'processando', 'pago_parcial', 'pago'].includes(l.status) && <Button asChild size="sm" variant="outline" className="min-h-11 rounded-full text-xs"><Link to={`/faturamento-convenios/lotes/${l.id}/retorno`} state={{ filtros: filtrosAtuais }}>{l.retorno_em ? 'Atualizar retorno' : 'Registrar retorno'}</Link></Button>}
  </div>;

  const acoesGlosa = (g: any) => <div className="flex flex-wrap gap-1">
    {g.status === 'pendente' && <Button size="sm" variant="outline" className="min-h-11 rounded-full text-xs" disabled={glosaAtualizandoId !== null || processandoLote} onClick={() => abrirRecurso(g)}>Preparar recurso</Button>}
    {g.status === 'recurso_preparacao' && <><Button size="sm" variant="outline" className="min-h-11 rounded-full text-xs" disabled={glosaAtualizandoId !== null || processandoLote} onClick={() => abrirRecurso(g)}>Revisar recurso</Button><Button size="sm" className="min-h-11 rounded-full text-xs" disabled={glosaAtualizandoId !== null || processandoLote || !prontaParaEnvio(g)} title={!g.recurso_prazo || !g.recurso_responsavel_id ? 'Defina prazo e responsável antes de enviar' : undefined} onClick={() => void updateGlosa(g.id)}>Marcar enviado</Button></>}
    {g.status === 'recurso_enviado' && <Button size="sm" className="min-h-11 rounded-full text-xs" disabled={glosaAtualizandoId !== null || processandoLote} onClick={() => abrirRetornoGlosa(g)}>Registrar retorno</Button>}
  </div>;

  const seletorGlosa = (g: any) => podePrepararRecurso(g)
    ? <Checkbox className="h-5 w-5" checked={glosasSelecionadas.has(g.id)} onCheckedChange={valor => alternarGlosa(g.id, valor === true)} aria-label={`Selecionar glosa ${g.codigo_glosa}`} disabled={processandoLote} />
    : null;

  if (conveniosQuery.isError) return <ErrorState title="Não foi possível carregar os convênios" error={conveniosQuery.error} onRetry={() => void conveniosQuery.refetch()} />;
  if (lotesQuery.isError) return <ErrorState title="Não foi possível carregar os lotes TISS" error={lotesQuery.error} onRetry={() => void lotesQuery.refetch()} />;
  if (isLoading) return <div className="space-y-4" aria-busy="true"><div className="h-9 w-72 animate-pulse rounded bg-muted" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div><div className="h-72 animate-pulse rounded-2xl bg-muted" /></div>;

  const alertasVisiveis = alertasExpandidos ? alertas : alertas.slice(0, 3);

  return <div className="space-y-6 pb-8">
    <PageHeader
      title="Faturamento de convênios"
      description={lotes.length + glosas.length > 0
        ? `${lotes.length} lote(s) · ${lotesRascunho} em rascunho · ${glosasEmAberto} glosa(s) em aberto`
        : 'Lotes TISS, retorno das operadoras, glosas e recursos.'}
      icon={<FileStack />}
      actions={(
        <>
          <Button aria-label="Atualizar faturamento" variant="outline" size="icon" className="h-11 w-11 rounded-full" onClick={atualizarTudo} disabled={atualizando}>
            <RefreshCw className={cn('h-4 w-4', atualizando && 'animate-spin')} />
          </Button>
          {lotesParaRegistrarGlosa.length > 0
            ? <Button asChild variant="outline" className="min-h-11 gap-2 rounded-full"><Link to="/faturamento-convenios/glosas/nova" state={{ filtros: filtrosAtuais }}><AlertTriangle className="h-4 w-4" />Registrar glosa</Link></Button>
            : <Button variant="outline" disabled className="min-h-11 gap-2 rounded-full disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100" title="Envie um lote antes de registrar uma glosa"><AlertTriangle className="h-4 w-4" />Registrar glosa</Button>}
          {convenios.length > 0
            ? <Button asChild className="min-h-11 gap-2 rounded-full"><Link to="/faturamento-convenios/lotes/novo" state={{ filtros: filtrosAtuais }}><Plus className="h-4 w-4" />Novo lote</Link></Button>
            : <Button disabled className="min-h-11 gap-2 rounded-full"><Plus className="h-4 w-4" />Novo lote</Button>}
        </>
      )}
    />
    {alertas.length > 0 && <section aria-label="Prazos do faturamento" className="space-y-2 rounded-2xl border border-warning/30 bg-warning/5 p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-warning-foreground"><BellRing className="h-4 w-4 shrink-0" />{alertas.length} prazo(s) pedem atenção</p>
      <ul className="space-y-1.5">{alertasVisiveis.map(alerta => <li key={alerta.id} className="flex flex-col gap-1 rounded-xl bg-card p-2 sm:flex-row sm:items-center sm:justify-between">
        <span className={cn('text-sm', alerta.gravidade === 'erro' && 'text-destructive')}>{alerta.texto}</span>
        <Button size="sm" variant="outline" className="min-h-11 gap-1.5 self-start rounded-full sm:self-auto" onClick={() => navigate('/tarefas/nova', { state: { taskPrefill: alerta.tarefa } })}><ListPlus className="h-4 w-4" />Criar tarefa</Button>
      </li>)}</ul>
      {alertas.length > 3 && <Button size="sm" variant="ghost" className="min-h-11 rounded-full" onClick={() => setAlertasExpandidos(v => !v)}>{alertasExpandidos ? 'Mostrar menos' : `Ver todos os ${alertas.length}`}</Button>}
    </section>}
    {lotesComDivergenciaFinanceira.length > 0 && <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><p>{lotesComDivergenciaFinanceira.length} lote(s) têm diferença entre o total recebido e o conciliado no financeiro. Confira lançamentos existentes antes de conciliar, para evitar duplicidade.</p></div>}
    {consultasAtingiramLimite && <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning"/><p>A lista atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} registros. Os indicadores podem não incluir todos os lotes ou glosas.</p></div>}
    {convenios.length === 0 && <p role="status" className="rounded-2xl border border-border bg-secondary p-3 text-sm text-muted-foreground">Cadastre e ative um <Link to="/convenios" className="font-medium text-foreground underline underline-offset-4">convênio</Link> para criar lotes TISS. Registre glosas depois de marcar um lote como enviado.</p>}
    {lotes.length > 0 && <div role="group" aria-label="Filtrar indicadores" className="flex flex-wrap items-center gap-2">
      <Select value={competenciaResumo} onValueChange={setCompetenciaResumo}><SelectTrigger aria-label="Competência dos indicadores" className="h-11 rounded-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="todas">Todas as competências</SelectItem>
        {competenciasDisponiveis.map(c => <SelectItem key={c} value={c}>{formatarCompetencia(c)}</SelectItem>)}
      </SelectContent></Select>
      <Select value={convenioResumo} onValueChange={setConvenioResumo}><SelectTrigger aria-label="Convênio dos indicadores" className="h-11 rounded-full sm:w-56"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="todos">Todos os convênios</SelectItem>
        {convenios.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
      </SelectContent></Select>
      {(competenciaResumo !== 'todas' || convenioResumo !== 'todos') && <Button size="sm" variant="ghost" className="min-h-11 rounded-full text-xs" onClick={() => { setCompetenciaResumo('todas'); setConvenioResumo('todos'); }}>Limpar</Button>}
    </div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      { label: 'Apresentado', legenda: 'lotes enviados à operadora', value: resumo.apresentado, icon: FileStack, cor: 'bg-secondary text-foreground' },
      { label: 'Pago', legenda: 'recebido das operadoras, sem lotes cancelados ou rejeitados', value: resumo.pago, icon: BadgeCheck, cor: 'bg-secondary text-foreground' },
      { label: 'Glosado', legenda: glosasQuery.isError ? 'glosas indisponíveis no momento' : 'glosas não canceladas', value: resumo.glosado, icon: AlertTriangle, cor: resumo.glosado > 0 ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-foreground' },
      { label: 'Recuperado', legenda: 'revertido em recurso', value: resumo.recuperado, icon: RotateCcw, cor: 'bg-secondary text-foreground' },
    ].map(({ label, legenda, value, icon: Icon, cor }) => <Card key={label} className="h-full rounded-2xl border-border/60 bg-card shadow-xs"><CardContent className="flex items-center gap-3 p-4"><span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cor)}><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-lg font-bold tabular-nums sm:text-2xl">{brl(value)}</p><p className="text-[11px] text-muted-foreground">{label} · {legenda}</p></div></CardContent></Card>)}</div>
    <Tabs value={activeTab} onValueChange={setActiveTab}><TabsList className="h-auto flex-wrap rounded-full border border-border bg-secondary p-1 [&>button]:rounded-full"><TabsTrigger value="lotes">Lotes ({lotes.length})</TabsTrigger><TabsTrigger value="guias">Guias ({guiasQuery.data?.length ?? 0})</TabsTrigger><TabsTrigger value="glosas">Glosas ({glosas.length})</TabsTrigger><TabsTrigger value="autorizacoes">Autorizações</TabsTrigger><TabsTrigger value="conciliacao">Conciliação</TabsTrigger><TabsTrigger value="relatorio">Por competência</TabsTrigger></TabsList>
      <TabsContent value="lotes">
        <Card className="rounded-2xl border-border/60 shadow-xs">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base font-semibold"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><FileStack className="h-4 w-4" /></span>Lotes registrados<FieldHelp term="lote_tiss" /></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(guiasQuery.isError || autorizacoesQuery.isError) && <ErroCompacto titulo={guiasQuery.isError ? 'Não foi possível carregar as guias dos lotes. O envio fica bloqueado até a conferência voltar.' : 'Não foi possível carregar as autorizações. O envio fica bloqueado até a conferência voltar.'} onRetry={() => { void guiasQuery.refetch(); void autorizacoesQuery.refetch(); }} />}
            <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar lote por número, convênio ou competência" placeholder="Buscar número, convênio ou competência..." value={buscaLote} onChange={event => setBuscaLote(event.target.value)} className="h-11 rounded-full pl-9" /></div>
            {lotes.length > 0 && <div role="group" aria-label="Filtrar lotes por status" className="flex flex-wrap items-center gap-2">
              {PILULAS_LOTE.filter(p => p.value === 'todos' || p.value === statusLote || contarLotes(p.value) > 0).map(p => <button key={p.value} type="button" aria-pressed={statusLote === p.value} onClick={() => setStatusLote(p.value)} className={pilulaClasse(statusLote === p.value)}>{p.label} <span className="tabular-nums opacity-80">{contarLotes(p.value)}</span></button>)}
              {filtroLoteAtivo && <Button size="sm" variant="outline" className="min-h-11 rounded-full" onClick={() => { setBuscaLote(''); setStatusLote('todos'); }}>Limpar filtros</Button>}
              <p className="ml-auto text-xs tabular-nums text-muted-foreground">Mostrando {lotesFiltrados.length} de {lotes.length} lotes.</p>
            </div>}
            {lotesFiltrados.length === 0 ? <div className="flex flex-col items-center gap-2 py-8 text-center"><span className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground"><FileStack className="h-7 w-7" /></span><p className="text-sm text-muted-foreground">{lotes.length === 0 ? 'Nenhum lote cadastrado. Crie um lote depois de fechar as guias da competência.' : 'Nenhum lote corresponde à busca e aos filtros.'}</p>{lotes.length > 0 && <Button size="sm" variant="outline" className="min-h-11 rounded-full" onClick={() => { setBuscaLote(''); setStatusLote('todos'); }}>Limpar filtros</Button>}</div> : <>
            <ul className="space-y-2 sm:hidden" aria-label="Lotes">{lotesFiltrados.map((l: any) => <li key={l.id} className="space-y-3 rounded-xl border border-border/60 bg-card p-3">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-medium">Lote {l.numero_lote}</p><p className="text-xs text-muted-foreground">{l.convenios?.nome} · {formatarCompetencia(l.competencia)}</p></div><Badge variant="outline" className={cn('whitespace-nowrap rounded-full', STATUS_LOTE_COR[l.status])}>{rotuloStatusLote(l.status)}</Badge></div>
              <div className="grid grid-cols-2 gap-2"><Campo rotulo="Apresentado"><span className="tabular-nums">{brl(l.valor_apresentado)}</span></Campo><Campo rotulo="Recebido"><span className="tabular-nums">{brl(l.valor_pago)}</span></Campo></div>
              {envioBloqueado(l.id) && errosDoLote(l.id) > 0 && <p className="text-xs font-medium text-destructive">{errosDoLote(l.id)} pendência(s) a corrigir</p>}
              {acoesLote(l)}
            </li>)}</ul>
            <div className="hidden overflow-hidden rounded-xl border border-border/60 sm:block"><div className="overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Lote</TableHead><TableHead>Convênio</TableHead><TableHead><span className="inline-flex items-center gap-1">Competência<FieldHelp term="competencia" /></span></TableHead><TableHead className="text-right">Apresentado / recebido</TableHead><TableHead>Status</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>{lotesFiltrados.map((l: any) => <TableRow key={l.id}>
              <TableCell className="font-medium">{l.numero_lote}<p className="text-[10px] text-muted-foreground">TISS {l.versao_tiss} · {l.quantidade_guias} guias</p></TableCell>
              <TableCell>{l.convenios?.nome}</TableCell>
              <TableCell>{formatarCompetencia(l.competencia)}</TableCell>
              <TableCell className="text-right"><span>{brl(l.valor_apresentado)}</span><p className="text-xs text-muted-foreground">Recebido: {brl(l.valor_pago)}</p><p className="text-xs text-muted-foreground">No financeiro: {brl(l.valor_conciliado_financeiro || 0)}</p></TableCell>
              <TableCell><Badge variant="outline" className={cn('whitespace-nowrap rounded-full', STATUS_LOTE_COR[l.status])}>{rotuloStatusLote(l.status)}</Badge>{envioBloqueado(l.id) && errosDoLote(l.id) > 0 ? <p className="mt-1 text-xs font-medium text-destructive">{errosDoLote(l.id)} pendência(s) a corrigir</p> : null}</TableCell>
              <TableCell>{acoesLote(l)}</TableCell>
            </TableRow>)}</TableBody>
          </Table></div></div></>}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="glosas"><Card className="rounded-2xl border-border/60 shadow-xs"><CardHeader><CardTitle className="flex items-center gap-2 text-base font-semibold"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><AlertTriangle className="h-4 w-4" /></span>Tratamento de glosas<FieldHelp term="glosa" /></CardTitle></CardHeader><CardContent className="space-y-3">
        {glosasQuery.isError ? <ErroCompacto titulo="Não foi possível carregar as glosas." onRetry={() => void glosasQuery.refetch()} /> : <>
        {(documentosQuery.isError || responsaveisQuery.isError) && <ErroCompacto titulo="Documentos ou responsáveis dos recursos não carregaram; os resumos podem estar incompletos." onRetry={() => { void documentosQuery.refetch(); void responsaveisQuery.refetch(); }} />}
        <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar glosa por código, guia, motivo, lote ou convênio" placeholder="Buscar código, guia, motivo, lote ou convênio..." value={buscaGlosa} onChange={event => setBuscaGlosa(event.target.value)} className="h-11 rounded-full pl-9" /></div>
        {glosas.length > 0 && <div role="group" aria-label="Filtrar glosas por status" className="flex flex-wrap items-center gap-2">
          {PILULAS_GLOSA.filter(p => p.value === 'todos' || p.value === statusGlosa || contarGlosas(p.value) > 0).map(p => <button key={p.value} type="button" aria-pressed={statusGlosa === p.value} onClick={() => setStatusGlosa(p.value)} className={pilulaClasse(statusGlosa === p.value)}>{p.label} <span className="tabular-nums opacity-80">{contarGlosas(p.value)}</span></button>)}
          {filtroGlosaAtivo && <Button size="sm" variant="outline" className="min-h-11 rounded-full" onClick={() => { setBuscaGlosa(''); setStatusGlosa('todos'); }}>Limpar filtros</Button>}
          <p className="ml-auto text-xs tabular-nums text-muted-foreground">Mostrando {glosasFiltradas.length} de {glosas.length} glosas.</p>
        </div>}
        {elegiveisVisiveis.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-secondary p-2">
          <label className="flex min-h-11 items-center gap-2 px-2 text-sm"><Checkbox className="h-5 w-5" checked={todasVisiveisMarcadas} disabled={processandoLote} onCheckedChange={valor => setGlosasSelecionadas(atual => { const proximo = new Set(atual); for (const g of elegiveisVisiveis) { if (valor === true) proximo.add(g.id); else proximo.delete(g.id); } return proximo; })} aria-label="Selecionar todas as glosas visíveis que aceitam recurso" />Selecionar todas</label>
          <span className="text-xs text-muted-foreground">{selecionadas.length} selecionada(s)</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="min-h-11 rounded-full" disabled={processandoLote || selecionadasParaPreparar.length === 0 || (responsaveisQuery.data ?? []).length === 0} onClick={() => setRecursoEmLoteAberto(true)}>Preparar recurso ({selecionadasParaPreparar.length})</Button>
            <Button size="sm" className="min-h-11 rounded-full" disabled={processandoLote || selecionadasParaEnvio.length === 0} onClick={() => void marcarSelecionadasEnviadas()} title="Só entram as glosas com justificativa, prazo e responsável">{processandoLote && <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />}Marcar enviados ({selecionadasParaEnvio.length})</Button>
          </div>
        </div>}
        {glosasFiltradas.length > 0 ? <>
          <ul className="space-y-2 sm:hidden" aria-label="Glosas">{glosasFiltradas.map((g: any) => <li key={g.id} className="space-y-3 rounded-xl border border-border/60 bg-card p-3">
            <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-2">{seletorGlosa(g)}<div className="min-w-0"><p className="font-medium">{g.codigo_glosa}</p><p className="text-xs text-muted-foreground">Lote {g.lotes_tiss?.numero_lote} · {g.lotes_tiss?.convenios?.nome}</p></div></div><Badge variant="outline" className={cn('whitespace-nowrap rounded-full', STATUS_GLOSA_COR[g.status])}>{rotuloStatusGlosa(g.status)}</Badge></div>
            {g.motivo && <p className="text-xs text-muted-foreground">{g.motivo}</p>}
            <div className="grid grid-cols-2 gap-2"><Campo rotulo="Glosado"><span className="tabular-nums">{brl(g.valor_glosado)}</span></Campo><Campo rotulo="Recuperado"><span className="tabular-nums">{brl(g.valor_recuperado)}</span></Campo></div>
            <ResumoRecurso glosa={g} responsavel={responsaveisQuery.data?.find(r => r.id === g.recurso_responsavel_id)?.nome} documentos={documentosPorGlosa.get(g.id)?.length ?? 0} />
            {acoesGlosa(g)}
          </li>)}</ul>
          <div className="hidden overflow-hidden rounded-xl border border-border/60 sm:block"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-10"><span className="sr-only">Selecionar</span></TableHead><TableHead>Código / motivo</TableHead><TableHead>Lote</TableHead><TableHead className="text-right">Glosado</TableHead><TableHead className="text-right">Recuperado</TableHead><TableHead>Status</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader><TableBody>{glosasFiltradas.map((g: any) => <TableRow key={g.id}><TableCell>{seletorGlosa(g)}</TableCell><TableCell><b>{g.codigo_glosa}</b>{g.guia_referencia && <p className="text-xs text-muted-foreground">Guia: {g.guia_referencia}</p>}<p className="max-w-sm text-xs text-muted-foreground">{g.motivo}</p>{g.recurso_justificativa && <p className="mt-1 max-w-sm text-xs text-muted-foreground">Recurso: {g.recurso_justificativa}</p>}<ResumoRecurso glosa={g} responsavel={responsaveisQuery.data?.find(r => r.id === g.recurso_responsavel_id)?.nome} documentos={documentosPorGlosa.get(g.id)?.length ?? 0} /></TableCell><TableCell>{g.lotes_tiss?.numero_lote}<p className="text-[10px]">{g.lotes_tiss?.convenios?.nome}</p></TableCell><TableCell className="text-right">{brl(g.valor_glosado)}</TableCell><TableCell className="text-right">{brl(g.valor_recuperado)}</TableCell><TableCell><Badge variant="outline" className={cn('whitespace-nowrap rounded-full', STATUS_GLOSA_COR[g.status])}>{rotuloStatusGlosa(g.status)}</Badge></TableCell><TableCell>{acoesGlosa(g)}</TableCell></TableRow>)}</TableBody></Table></div></div>
        </> : <div className="flex flex-col items-center gap-2 py-8 text-center"><span className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground"><ShieldCheck className="h-7 w-7" /></span><p className="text-sm text-muted-foreground">{glosas.length === 0 ? 'Nenhuma glosa registrada nesta clínica.' : 'Nenhuma glosa corresponde à busca e aos filtros.'}</p>{glosas.length > 0 && <Button size="sm" variant="outline" className="min-h-11 rounded-full" onClick={() => { setBuscaGlosa(''); setStatusGlosa('todos'); }}>Limpar filtros</Button>}</div>}
        </>}
      </CardContent></Card></TabsContent>
      <TabsContent value="guias">
        {guiasQuery.isError || autorizacoesQuery.isError
          ? <ErroCompacto titulo="Não foi possível carregar as guias ou as autorizações." onRetry={() => { void guiasQuery.refetch(); void autorizacoesQuery.refetch(); }} />
          : <GuiasPorAutorizacao guias={guiasQuery.data ?? []} lotes={lotes} autorizacoes={autorizacoesQuery.data ?? []} />}
      </TabsContent>
      <TabsContent value="autorizacoes">
        {autorizacoesQuery.isError
          ? <ErroCompacto titulo="Não foi possível carregar as autorizações." onRetry={() => void autorizacoesQuery.refetch()} />
          : <FilaAutorizacoesConvenio autorizacoes={autorizacoesQuery.data ?? []} convenios={convenios} hoje={hoje} />}
      </TabsContent>
      <TabsContent value="conciliacao">
        {profile?.clinica_id && <ConciliacaoConvenioPorLote clinicaId={profile.clinica_id} lotes={lotesComNomeConvenio} />}
      </TabsContent>
      <TabsContent value="relatorio">
        <RelatorioFaturamentoCompetencia convenios={convenios} glosas={glosas} lotes={lotesComNomeConvenio} />
      </TabsContent>
    </Tabs>
    <div className="flex items-start gap-2 rounded-2xl border border-border bg-secondary p-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-foreground" /><span>O XML é um resumo operacional e este sistema não o transmite à operadora. Valide o arquivo no padrão/XSD exigido e registre o envio somente depois de transmiti-lo pelo canal oficial. O retorno pode ser conciliado com o <Link to="/fluxo-caixa" className="font-medium text-foreground underline-offset-2 hover:underline">Fluxo de Caixa</Link> pelo formulário. Como o lote não identifica as cobranças individuais, confira lançamentos anteriores antes de confirmar para evitar duplicidade.</span></div>

    <RecursoGlosaEmLoteDialog
      open={recursoEmLoteAberto}
      quantidade={selecionadasParaPreparar.length}
      responsaveis={responsaveisQuery.data ?? []}
      salvando={processandoLote}
      onOpenChange={setRecursoEmLoteAberto}
      onConfirmar={dados => void prepararRecursoEmLote(dados)}
    />

    <AlertDialog open={!!loteParaConfirmarEnvio} onOpenChange={open => { if (!open && !loteEnviandoId) setLoteParaConfirmarEnvio(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar envio do lote {loteParaConfirmarEnvio?.numero_lote}?</AlertDialogTitle>
          <AlertDialogDescription>
            O EloLab não transmite este arquivo à operadora. Marque como enviado somente depois de transmitir o lote pelo canal oficial. O XML baixado aqui é um resumo operacional e não substitui a guia TISS.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={!!loteEnviandoId}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!!loteEnviandoId}
            onClick={event => {
              event.preventDefault();
              if (!loteParaConfirmarEnvio) return;
              void updateLot(loteParaConfirmarEnvio.id).then(salvou => {
                if (salvou) setLoteParaConfirmarEnvio(null);
              });
            }}
          >
            {loteEnviandoId && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            Já enviei pelo canal oficial
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
