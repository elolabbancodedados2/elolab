import { nomeMedico } from '@/lib/formatters';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { format, addDays, differenceInMinutes, differenceInHours, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ErrorState } from '@/components/ErrorState';
import { ActionableEmptyState } from '@/components/ActionableEmptyState';
import { PageHeader } from '@/components/PageHeader';
import { pacienteCorresponde } from '@/lib/buscaPaciente';
import { dadosAoRegistrarColeta, gravarFiltrosWorklist, lerFiltrosWorklist, podeGerenciarLaboratorioPorPapel, resumirPendenciasPorSetor, STATUS_COLETA_LABELS, STATUS_COLETA_PENDENTES, type FiltrosWorklist } from '@/lib/laboratorioWorkflow';
import { dateOnlyInTimeZone, parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PedidosLaboratorioPanel } from '@/pages/laboratorio/PedidosLaboratorioPanel';
import { GestaoLaboratorioPanel } from '@/pages/laboratorio/GestaoLaboratorioPanel';
import { IndicadoresLaboratorioPanel } from '@/pages/laboratorio/IndicadoresLaboratorioPanel';
import { LaboratorioSubnav } from '@/components/laboratorio/LaboratorioSubnav';
import { previsaoEntrega, proximaColetaPendente, situacaoSla, slaHorasDoSetor } from '@/lib/laboratorioPrazos';
import { htmlMapaBancada } from '@/lib/mapaBancada';
import { formatDateTimeSaoPaulo } from '@/lib/dateOnly';
import { contagem } from '@/lib/plural';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Teto da worklist do laboratório.
 *
 * O PostgREST corta em 1.000 linhas por padrão e não avisa. Pedimos um a mais
 * que este teto para detectar o corte e dizer ao operador que existe mais
 * histórico, em vez de deixá-lo achar que a amostra sumiu.
 */
const TETO_WORKLIST = 500;
const FUSO_CLINICA = 'America/Sao_Paulo';
import {
  FlaskConical, Search, Plus, TestTube, ClipboardCheck, AlertTriangle,
  Clock, CheckCircle2, XCircle, Eye, Printer, Tag,
  User, Droplets, MapPin, Package, FileText, Link2, Filter,
  TrendingUp, Activity, Calendar, ArrowRight, Trash2, RotateCcw,
  Download, Zap, Timer, Shield, Loader2, RefreshCw, Phone,
} from 'lucide-react';
import { linkWhatsApp } from '@/lib/whatsapp';

// Estados normais em neutro; âmbar e vermelho só para problema (recoleta, rejeição, cancelamento).
const statusColors: Record<string, string> = {
  pendente: 'border border-border bg-card text-foreground',
  coletado: 'border border-border bg-secondary text-foreground',
  em_analise: 'border border-border bg-secondary text-foreground',
  validado: 'border border-border bg-secondary text-foreground',
  liberado: 'border border-transparent bg-primary text-primary-foreground',
  cancelado: 'border border-border bg-muted text-muted-foreground',
  recoleta: 'border border-warning/35 bg-warning/10 text-warning-foreground',
  rejeitada: 'border border-destructive/30 bg-destructive/10 text-destructive',
};

const statusLabels = STATUS_COLETA_LABELS;

const PIPELINE_STEPS = ['pendente', 'coletado', 'em_analise', 'validado', 'liberado'];
const LIMITE_PENDENCIAS_SETOR = 2000;


export default function Laboratorio() {
  const location = useLocation();
  const navigate = useNavigate();
  const openNewColeta = () => navigate('/laboratorio/coletas/nova', { state: { laboratorioSearch: location.search, buscaPaciente: search } });
  const contextoDaRota = location.state as { buscaPaciente?: unknown } | null;
  const [agora, setAgora] = useState(() => new Date());
  const [search, setSearch] = useState(() => typeof contextoDaRota?.buscaPaciente === 'string' ? contextoDaRota.buscaPaciente : '');
  // Filtros na URL: sobrevivem à atualização da worklist, ao recarregar e ao voltar de outra tela.
  const [searchParams, setSearchParams] = useSearchParams();
  const filtrosWorklist = lerFiltrosWorklist(searchParams);
  const { status: statusFilter, setor: setorFilter, periodo: dateFilter, urgente: urgentOnly } = filtrosWorklist;
  const atualizarFiltros = (patch: Partial<FiltrosWorklist>) =>
    setSearchParams(atual => gravarFiltrosWorklist(atual, { ...lerFiltrosWorklist(atual), ...patch }), { replace: true });
  const setStatusFilter = (status: string) => atualizarFiltros({ status });
  const setSetorFilter = (setor: string) => atualizarFiltros({ setor });
  const setDateFilter = (periodo: string) => atualizarFiltros({ periodo });


  const [activeTab, setActiveTab] = useState(() => searchParams.get('aba') === 'pedidos' ? 'pedidos' : 'worklist');
  const [coletaParaCancelar, setColetaParaCancelar] = useState<{ id: string; status: string; codigo: string; observacoes: string | null } | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [codigoBipado, setCodigoBipado] = useState('');
  const worklistTabRef = useRef<HTMLButtonElement>(null);
  const limparFilaTriggerRef = useRef<HTMLAnchorElement>(null);
  const focusWorklistAfterFilter = useRef(false);
  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();
  const podeGerenciarLaboratorio = podeGerenciarLaboratorioPorPapel(profile?.roles);

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeTab !== 'worklist' || !focusWorklistAfterFilter.current) return;
    focusWorklistAfterFilter.current = false;
    worklistTabRef.current?.focus();
  }, [activeTab]);

  const setoresQuery = useQuery({
    queryKey: ['lab-setores-worklist-sla', profile?.clinica_id],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('laboratorio_setores')
        .select('id, nome, sla_alerta_horas').eq('clinica_id', profile!.clinica_id!).eq('ativo', true).order('nome');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string; sla_alerta_horas: number | null }>;
    },
  });

  const coletasQuery = useInfiniteQuery({
    queryKey: ['coletas-laboratorio', profile?.clinica_id, user?.id, setorFilter],
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      let query = (supabase as any)
        .from('coletas_laboratorio')
        .select('*, pacientes(nome, cpf, data_nascimento, sexo, telefone), medicos(nome, crm, especialidade), laboratorio_setores(nome), exames(tipo_exame, tipo_exames_catalog(tempo_estimado_horas))')
        .eq('clinica_id', profile!.clinica_id!);
      if (setorFilter !== 'todos') query = query.eq('setor_id', setorFilter);
      if (pageParam) {
        // Paginação por cursor: várias amostras podem ter o mesmo created_at,
        // então o id também desempata para não pular nem repetir registros.
        query = query.or(
          `created_at.lt.${pageParam.created_at},and(created_at.eq.${pageParam.created_at},id.lt.${pageParam.id})`,
        );
      }
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(TETO_WORKLIST + 1);
      if (error) throw error;
      const linhas = data ?? [];
      return { items: linhas.slice(0, TETO_WORKLIST), hasMore: linhas.length > TETO_WORKLIST };
    },
    getNextPageParam: (ultimaPagina) => {
      if (!ultimaPagina.hasMore || ultimaPagina.items.length === 0) return undefined;
      const ultimaColeta = ultimaPagina.items[ultimaPagina.items.length - 1];
      return { created_at: ultimaColeta.created_at, id: ultimaColeta.id };
    },
    enabled: !!profile?.clinica_id,
  });
  const coletas = coletasQuery.data?.pages.flatMap(pagina => pagina.items);
  const isLoading = coletasQuery.isLoading;

  useEffect(() => {
    const state = location.state as { focusLimparFila?: unknown } | null;
    if (state?.focusLimparFila !== true || isLoading) return;
    window.requestAnimationFrame(() => limparFilaTriggerRef.current?.focus());
  }, [location.state, isLoading]);

  // Mesmo prefixo da worklist: as invalidações após cada ação também recontam as pendências.
  const pendenciasSetorQuery = useQuery({
    queryKey: ['coletas-laboratorio', profile?.clinica_id, 'pendencias-setor'],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('coletas_laboratorio')
        .select('setor_id, urgente')
        .eq('clinica_id', profile!.clinica_id!)
        .in('status', [...STATUS_COLETA_PENDENTES])
        .limit(LIMITE_PENDENCIAS_SETOR + 1);
      if (error) throw error;
      return data ?? [];
    },
  });
  const pendenciasPorSetor = useMemo(
    () => resumirPendenciasPorSetor((pendenciasSetorQuery.data ?? []).slice(0, LIMITE_PENDENCIAS_SETOR), setoresQuery.data ?? []),
    [pendenciasSetorQuery.data, setoresQuery.data],
  );

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, expectedStatus, motivo, observacoesAtuais }: { id: string; status: string; expectedStatus: string; motivo?: string; observacoesAtuais?: string | null }) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const allowedNext: Record<string, string[]> = {
        pendente: ['coletado', 'cancelado'],
        recoleta: ['coletado', 'cancelado'],
        coletado: ['em_analise'],
        em_analise: ['validado'],
      };
      if (!allowedNext[expectedStatus]?.includes(status)) throw new Error('Esta transição de status não é permitida. Atualize a worklist.');
      if (status === 'validado') {
        // A validação precisa registrar a autoria de quem conferiu os resultados
        // na mesma transação que avança o status. Uma leitura seguida de update
        // direto contornava esse registro e permitia divergência entre telas.
        const { error } = await (supabase as any).rpc('validar_coleta_laboratorio', {
          p_coleta_id: id,
        });
        if (error) throw error;
        return;
      }
      const updates: Record<string, unknown> = { status };
      if (status === 'coletado') Object.assign(updates, dadosAoRegistrarColeta(new Date(), profile.id));
      if (status === 'cancelado' && motivo?.trim()) {
        updates.observacoes = [observacoesAtuais?.trim(), `Cancelamento: ${motivo.trim()}`].filter(Boolean).join('\n');
      }
      const { data, error } = await (supabase as any).from('coletas_laboratorio').update(updates)
        .eq('id', id).eq('clinica_id', profile.clinica_id).eq('status', expectedStatus).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A coleta mudou de status ou não pertence à clínica atual. Atualize a worklist.');
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['coletas-laboratorio', profile?.clinica_id] });
      toast.success(variables.status === 'validado' ? 'Coleta validada e conferência registrada' : variables.status === 'cancelado' ? 'Coleta cancelada' : 'Status atualizado');
      if (variables.status === 'cancelado') { setColetaParaCancelar(null); setMotivoCancelamento(''); }
    },
    // Sem `onError` o botão parecia não fazer nada: o técnico seguia
    // trabalhando com uma coleta pendente sem saber que o update falhou.
    onError: (e) => toast.error('Não foi possível mudar o status da coleta', {
      description: mensagemDeErro(e),
    }),
  });

  const hojeNaClinica = todaySaoPauloDateOnly(agora);
  const ontemNaClinica = format(addDays(parseDateOnly(hojeNaClinica)!, -1), 'yyyy-MM-dd');

  // ─── Filtering with date ─────────────────────────────────
  const filtered = useMemo(() => {
    if (!coletas) return [];
    return coletas.filter((c: any) => {
      // Search
      if (search.trim()) {
        // O código da amostra é específico do laboratório; paciente segue a
        // mesma regra das outras telas (sem acento, CPF sem máscara).
        const codigo = c.codigo_amostra?.toLowerCase().includes(search.trim().toLowerCase());
        const paciente = c.pacientes && pacienteCorresponde(c.pacientes, search);
        if (!codigo && !paciente) return false;
      }
      // Status
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      // Urgent
      if (urgentOnly && !c.urgente) return false;
      // Date
      const diaCriacao = c.created_at ? dateOnlyInTimeZone(new Date(c.created_at), FUSO_CLINICA) : null;
      if (dateFilter === 'hoje' && diaCriacao !== hojeNaClinica) return false;
      if (dateFilter === 'ontem' && diaCriacao !== ontemNaClinica) return false;
      if (dateFilter === '7dias' && c.created_at && new Date(c.created_at) < subDays(agora, 7)) return false;
      return true;
    });
  }, [coletas, search, statusFilter, urgentOnly, dateFilter, hojeNaClinica, ontemNaClinica, agora]);

  // ─── Stats ───────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!coletas) return { pendentes: 0, coletados: 0, emAnalise: 0, validados: 0, liberados: 0, cancelados: 0, urgentes: 0, total: 0 };
    const todayItems = coletas.filter((c: any) => c.created_at && dateOnlyInTimeZone(new Date(c.created_at), FUSO_CLINICA) === hojeNaClinica);
    return {
      pendentes: todayItems.filter((c: any) => c.status === 'pendente').length,
      coletados: todayItems.filter((c: any) => c.status === 'coletado').length,
      emAnalise: todayItems.filter((c: any) => c.status === 'em_analise').length,
      validados: todayItems.filter((c: any) => c.status === 'validado').length,
      liberados: todayItems.filter((c: any) => c.status === 'liberado').length,
      cancelados: todayItems.filter((c: any) => c.status === 'cancelado').length,
      urgentes: todayItems.filter((c: any) => c.urgente).length,
      total: todayItems.filter((c: any) => c.status !== 'cancelado').length,
    };
  }, [coletas, hojeNaClinica]);

  // SLA: só amostras em aberto, comparadas ao limite do próprio setor.
  const setoresSla = setoresQuery.data ?? [];
  const slaDaColeta = (coleta: any) => situacaoSla(coleta, slaHorasDoSetor(coleta.setor_id, setoresSla), agora);
  const slaBreaches = useMemo(() => {
    if (!coletas) return [];
    return coletas.filter((c: any) => situacaoSla(c, slaHorasDoSetor(c.setor_id, setoresQuery.data ?? []), agora) === 'estourado');
  }, [coletas, agora, setoresQuery.data]);

  const completionRate = stats.total > 0
    ? Math.round(((stats.liberados + stats.validados) / stats.total) * 100) : 0;

  const getNextStatus = (current: string) => {
    // A liberação dos resultados passa pelo módulo Laudos: lá cada resultado
    // é conferido, publicado e notificado; não deve haver atalho pelo pipeline.
    if (current === 'validado') return null;
    const idx = PIPELINE_STEPS.indexOf(current);
    return idx >= 0 && idx < PIPELINE_STEPS.length - 1 ? PIPELINE_STEPS[idx + 1] : null;
  };

  const getSLAColor = (coleta: any) => {
    const situacao = slaDaColeta(coleta);
    if (situacao === 'estourado') return 'text-destructive';
    if (situacao === 'atencao') return 'text-warning-foreground';
    return 'text-muted-foreground';
  };

  const getSLALabel = (created: string) => {
    const mins = Math.max(0, differenceInMinutes(agora, new Date(created)));
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    return `${h}h${mins % 60 > 0 ? `${mins % 60}m` : ''}`;
  };

  if (!profile?.clinica_id) {
    return <ErrorState title="Clínica não identificada" description="O módulo Laboratório só pode carregar dados após identificar a clínica da sessão." />;
  }

  const erroWorklist = coletasQuery.isError
    ? <ErrorState title="Não foi possível carregar a worklist do laboratório" description="As ações de coleta foram pausadas para evitar atualizar amostras com status desatualizado. As outras abas continuam disponíveis." error={coletasQuery.error} onRetry={() => void coletasQuery.refetch()} />
    : null;

  const imprimirMapaBancada = () => {
    const janela = window.open('', '_blank');
    if (!janela) { toast.error('O navegador bloqueou a janela de impressão. Permita pop-ups para imprimir o mapa de bancada.'); return; }
    janela.document.write(htmlMapaBancada(coletas ?? [], formatDateTimeSaoPaulo(new Date())));
    janela.document.close();
    janela.document.getElementById('imprimir-bancada')?.addEventListener('click', () => janela.print());
  };

  const biparAmostra = async (codigoLido: string) => {
    const codigo = codigoLido.trim().toUpperCase();
    if (!codigo || !profile?.clinica_id) return;
    setCodigoBipado('');
    const local = (coletas ?? []).find((c: any) => String(c.codigo_amostra ?? '').toUpperCase() === codigo);
    if (local) {
      setSearch(codigo);
      atualizarFiltros({ status: 'todos', setor: 'todos', periodo: 'todos', urgente: false });
      setActiveTab('worklist');
      toast.success(`Amostra ${codigo} localizada`, { description: local.pacientes?.nome ?? undefined });
      return;
    }
    const { data, error } = await supabase.from('coletas_laboratorio').select('id')
      .eq('clinica_id', profile.clinica_id).eq('codigo_amostra', codigo).limit(1).maybeSingle();
    if (error) { toast.error('Não foi possível buscar a amostra', { description: mensagemDeErro(error) }); return; }
    if (!data) { toast.error(`Nenhuma amostra com o código ${codigo} nesta clínica.`); return; }
    navigate(`/laboratorio/coletas/${data.id}/resultados`, { state: { laboratorioSearch: location.search, buscaPaciente: search } });
  };

  const filtrarPipeline = (filter: string) => {
    focusWorklistAfterFilter.current = true;
    setActiveTab('worklist');
    if (filter === 'urgente') {
      atualizarFiltros({ periodo: 'hoje', status: 'todos', urgente: !urgentOnly });
      return;
    }
    atualizarFiltros({ periodo: 'hoje', urgente: false, status: statusFilter === filter ? 'todos' : filter });
  };
  const limparFiltrosWorklist = () => { setSearch(''); atualizarFiltros({ status: 'todos', setor: 'todos', periodo: 'hoje', urgente: false }); };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laboratório"
        description={stats.total > 0
          ? `${stats.total} amostra${stats.total === 1 ? '' : 's'} hoje · ${stats.pendentes} pendente${stats.pendentes === 1 ? '' : 's'} · ${stats.urgentes} urgente${stats.urgentes === 1 ? '' : 's'}`
          : 'Central de gestão laboratorial — worklist, coletas e resultados'}
        icon={<FlaskConical />}
        actions={
          <>
            {podeGerenciarLaboratorio && (
              <Button asChild variant="outline" className="rounded-full gap-2">
                <Link
                  ref={limparFilaTriggerRef}
                  to="/laboratorio/coletas/limpar"
                  state={{ laboratorioSearch: location.search, buscaPaciente: search }}
                >
                  Limpar fila antiga
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={() => void coletasQuery.refetch()}
              aria-label="Atualizar worklist"
              title="Atualizar worklist"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              onClick={openNewColeta}
              className="rounded-full gap-2 bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
            >
              <Plus aria-hidden="true" className="h-4 w-4" /> Nova coleta
            </Button>
          </>
        }
      />

      <LaboratorioSubnav />

      {activeTab === 'worklist' && !coletasQuery.isError && (
        <>
      {/* ─── Indicator strip ─── */}
      <section aria-label="Indicadores do laboratório hoje">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5">
          {[
            { label: 'Urgentes', value: stats.urgentes, icon: Zap, filter: 'urgente', problema: stats.urgentes > 0 },
            { label: 'Pendentes', value: stats.pendentes, icon: Clock, filter: 'pendente', problema: false },
            { label: 'Em análise', value: stats.emAnalise, icon: Activity, filter: 'em_analise', problema: false },
            { label: 'Validados', value: stats.validados, icon: CheckCircle2, filter: 'validado', problema: false },
            { label: 'Liberados', value: stats.liberados, icon: Download, filter: 'liberado', problema: false },
          ].map((s) => {
            const isActive = s.filter === 'urgente'
              ? urgentOnly
              : statusFilter === s.filter && dateFilter === 'hoje' && !urgentOnly;
            return (
              <button
                key={s.label}
                type="button"
                aria-pressed={isActive}
                onClick={() => filtrarPipeline(s.filter)}
                className={cn(
                  'min-h-11 rounded-2xl border border-border/60 bg-card p-3 text-left shadow-xs transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive && 'border-transparent bg-primary text-primary-foreground',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', isActive ? 'bg-primary-foreground/15' : s.problema ? 'bg-warning/10' : 'bg-secondary')}>
                    <s.icon aria-hidden="true" className={cn('h-5 w-5', isActive ? 'text-primary-foreground' : s.problema ? 'text-warning-foreground' : 'text-foreground')} />
                  </div>
                  <div>
                    <p className={cn('text-2xl font-bold tabular-nums', isActive ? 'text-primary-foreground' : 'text-foreground')}>{s.value}</p>
                    <p className={cn('text-xs', isActive ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{s.label}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── Hero: próxima coleta (urgente primeiro, depois a mais antiga) ─── */}
      {(() => {
        if (!coletas) return null;
        const proximo: any = proximaColetaPendente(coletas as any[]);
        if (!proximo) return null;
        const whatsLink = linkWhatsApp(
          proximo.pacientes?.telefone,
          `Olá ${proximo.pacientes?.nome ?? ''}, sua coleta está pendente no laboratório.`,
        );
        return (
          <div className={cn('rounded-2xl border bg-card p-4 shadow-sm', proximo.urgente ? 'border-warning/40' : 'border-border')}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-foreground">
                  <FlaskConical aria-hidden="true" className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className={cn('text-xs font-medium', proximo.urgente ? 'text-warning-foreground' : 'text-muted-foreground')}>
                    {proximo.urgente ? 'Urgente · próxima a coletar' : 'Próxima coleta pendente'}
                  </p>
                  <p className="text-lg font-bold truncate">{proximo.pacientes?.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {proximo.tipo_amostra}
                    {proximo.tubo && ` · ${proximo.tubo}`}
                    {proximo.medicos?.nome && ` · ${nomeMedico(proximo.medicos.nome)}`}
                    {proximo.created_at && ` · aguardando há ${getSLALabel(proximo.created_at)}`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                {whatsLink && (
                  <Button asChild size="sm" variant="outline" className="min-h-11 rounded-full text-xs gap-1">
                    <a href={whatsLink} target="_blank" rel="noopener noreferrer" aria-label={`Chamar ${proximo.pacientes?.nome ?? 'paciente'} no WhatsApp`}>
                      <Phone aria-hidden="true" className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  className="min-h-11 rounded-full text-xs gap-1"
                  disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate({ id: proximo.id, status: 'coletado', expectedStatus: proximo.status })}
                >
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /> Registrar coleta
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Leitor de código de barras: o leitor digita o código e envia Enter. */}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => { event.preventDefault(); void biparAmostra(codigoBipado); }}
      >
        <div className="min-w-0 flex-1 space-y-1 sm:max-w-xs">
          <Label htmlFor="lab-bipar-amostra" className="text-xs">Bipar amostra</Label>
          <Input
            id="lab-bipar-amostra"
            value={codigoBipado}
            onChange={(event) => setCodigoBipado(event.target.value)}
            placeholder="Leia o código de barras do tubo"
            autoComplete="off"
            className="h-11 font-mono uppercase"
          />
        </div>
        <Button type="submit" variant="outline" className="min-h-11 rounded-full" disabled={!codigoBipado.trim()}>Localizar</Button>
      </form>

      {/* SLA Breach Alert */}
      {slaBreaches.length > 0 && (
        <div role="alert" className="bg-destructive/10 border border-destructive/30 rounded-2xl p-3 flex items-center gap-3">
          <AlertTriangle aria-hidden="true" className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">
              {contagem(slaBreaches.length, 'amostra')} em aberto além do SLA do setor
            </p>
            <p className="text-xs text-muted-foreground">
              Pacientes: {slaBreaches.slice(0, 3).map((c: any) => c.pacientes?.nome).join(', ')}
              {slaBreaches.length > 3 && ` +${slaBreaches.length - 3}`}
            </p>
          </div>
        </div>
      )}

      {coletasQuery.hasNextPage && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Há mais coletas além das {coletas?.length ?? TETO_WORKLIST} carregadas. Os indicadores e a taxa de conclusão usam somente os registros carregados.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => void coletasQuery.fetchNextPage()}
            disabled={coletasQuery.isFetchingNextPage}
          >
            {coletasQuery.isFetchingNextPage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
            {coletasQuery.isFetchingNextPage ? 'Carregando…' : 'Carregar mais registros'}
          </Button>
        </div>
      )}
        </>
      )}

      {/* Tabs */}
      <Tabs activationMode="manual" value={activeTab} onValueChange={setActiveTab}>
        <div className="max-w-full">
          <TabsList aria-label="Seções do laboratório" className="h-auto w-full min-w-0 flex-wrap justify-start gap-1 overflow-visible">
            <TabsTrigger ref={worklistTabRef} value="worklist" className="gap-1"><ClipboardCheck className="h-3.5 w-3.5" />Worklist</TabsTrigger>
            <TabsTrigger value="pipeline" className="gap-1"><Activity className="h-3.5 w-3.5" />Pipeline</TabsTrigger>
            <TabsTrigger value="pedidos" className="gap-1"><TestTube className="h-3.5 w-3.5" />Pedidos</TabsTrigger>
            {podeGerenciarLaboratorio && <TabsTrigger value="gestao" className="gap-1"><Package className="h-3.5 w-3.5" />Gestão do laboratório</TabsTrigger>}
            <TabsTrigger value="indicadores" className="gap-1"><Activity className="h-3.5 w-3.5" />Indicadores</TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Worklist Tab ─── */}
        <TabsContent value="worklist" className="space-y-4">
          {erroWorklist}
          {!erroWorklist && <>
          {/* Filters */}
          <div data-testid="lab-worklist-filters" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  aria-label="Buscar coletas por paciente, código ou CPF"
                  placeholder="Buscar paciente, código ou CPF..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 rounded-full pl-10 focus-visible:ring-primary"
                />
              </div>
              <Select value={setorFilter} onValueChange={setSetorFilter}>
                <SelectTrigger aria-label="Filtrar por setor" className="h-11 rounded-full w-44"><SelectValue placeholder="Todos os setores" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os setores</SelectItem>
                  {(setoresQuery.data ?? []).map((setor) => <SelectItem key={setor.id} value={setor.id}>{setor.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger aria-label="Filtrar por período" className="h-11 rounded-full w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="ontem">Ontem</SelectItem>
                  <SelectItem value="7dias">7 dias</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
              <span data-testid="lab-result-count" className="ml-auto text-xs text-muted-foreground tabular-nums">
                {filtered.length} de {coletas?.length ?? 0}
              </span>
            </div>
            {pendenciasPorSetor.length > 0 && (
              <div role="group" aria-label="Pendências por setor" className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">Em aberto por setor</span>
                {pendenciasPorSetor.map((pendencia) => {
                  const rotulo = `${pendencia.nome}: ${pendencia.total} pendente${pendencia.total === 1 ? '' : 's'}${pendencia.urgentes > 0 ? `, ${pendencia.urgentes} urgente${pendencia.urgentes === 1 ? '' : 's'}` : ''}`;
                  const conteudo = (
                    <>
                      {pendencia.nome}
                      <span className="tabular-nums font-semibold">{pendencia.total}</span>
                      {pendencia.urgentes > 0 && <span className="inline-flex items-center gap-0.5 text-warning-foreground"><Zap className="h-3 w-3" aria-hidden="true" />{pendencia.urgentes}</span>}
                    </>
                  );
                  if (!pendencia.id) {
                    return <span key="sem-setor" aria-label={rotulo} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground">{conteudo}</span>;
                  }
                  const ativo = setorFilter === pendencia.id;
                  return (
                    <button
                      key={pendencia.id}
                      type="button"
                      aria-pressed={ativo}
                      aria-label={rotulo}
                      onClick={() => setSetorFilter(ativo ? 'todos' : pendencia.id!)}
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
                        ativo ? 'border-transparent bg-primary text-primary-foreground shadow-sm [&_.text-warning-foreground]:text-primary-foreground' : 'border-border bg-background text-foreground hover:border-foreground/30',
                      )}
                    >
                      {conteudo}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Pill status filters */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: 'todos', label: 'Todos' },
                ...Object.entries(statusLabels).map(([k, v]) => ({ value: k, label: v })),
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={statusFilter === value && !urgentOnly}
                  onClick={() => atualizarFiltros({ urgente: false, status: value })}
                  className={cn(
                    'h-8 rounded-full border px-3 text-xs transition-colors',
                    statusFilter === value && !urgentOnly
                      ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={urgentOnly}
                onClick={() => filtrarPipeline('urgente')}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs gap-1 inline-flex items-center transition-colors',
                  urgentOnly
                    ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
                    : 'border-warning/40 text-warning-foreground hover:border-warning',
                )}
              >
                <Zap className="h-3 w-3" /> Urgentes
              </button>
              {(search.trim() || statusFilter !== 'todos' || setorFilter !== 'todos' || dateFilter !== 'hoje' || urgentOnly) && (
                <button
                  type="button"
                  onClick={limparFiltrosWorklist}
                  className="h-8 rounded-full border border-border px-3 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <XCircle className="h-3 w-3" /> Limpar filtros
                </button>
              )}
            </div>
          </div>

          {/* Coletas list */}
          <div className="space-y-2">
            {isLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => (
                  <Card key={i}><CardContent className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-5 w-20 bg-muted/60 animate-pulse rounded" />
                      <div className="flex-1" />
                      <div className="h-7 w-24 bg-muted animate-pulse rounded" />
                    </div>
                  </CardContent></Card>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <Card className="rounded-2xl border-border/60">
                <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
                    <FlaskConical className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {search.trim() || statusFilter !== 'todos' || setorFilter !== 'todos' || urgentOnly
                        ? 'Nenhuma coleta corresponde aos filtros'
                        : coletasQuery.hasNextPage ? 'Nenhuma coleta nesta página' : 'Nenhuma coleta neste período'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {coletasQuery.hasNextPage
                        ? 'Carregue mais registros para ampliar a busca ou ajuste os filtros aplicados.'
                        : 'Amplie o período para consultar outras coletas ou registre uma nova coleta.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button
                      className="rounded-full gap-2 bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                      onClick={coletasQuery.hasNextPage
                        ? () => void coletasQuery.fetchNextPage()
                        : dateFilter !== 'todos'
                          ? () => setDateFilter('todos')
                          : openNewColeta}
                    >
                      {coletasQuery.hasNextPage ? 'Carregar mais registros' : dateFilter !== 'todos' ? 'Ver todos os períodos' : <><Plus className="h-4 w-4" />Nova coleta</>}
                    </Button>
                    {(search.trim() || statusFilter !== 'todos' || setorFilter !== 'todos' || dateFilter !== 'hoje' || urgentOnly) && (
                      <Button
                        variant="outline"
                        className="rounded-full gap-2"
                        onClick={limparFiltrosWorklist}
                      >
                        Limpar filtros
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              filtered.map((coleta: any) => {
                const nextStatus = getNextStatus(coleta.status);
                const previsao = previsaoEntrega(coleta, agora);
                const whatsLink = linkWhatsApp(
                  coleta.pacientes?.telefone,
                  `Olá ${coleta.pacientes?.nome ?? ''}, sua amostra laboratorial (${coleta.codigo_amostra ?? ''}) está em andamento.`,
                );
                return (
                  <Card key={coleta.id} className={cn(
                    'rounded-2xl border-border/60 shadow-xs transition-colors',
                    coleta.urgente && 'border-warning/50',
                  )}>
                    <CardContent className="py-3 px-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{coleta.pacientes?.nome}</span>
                            <Badge variant="outline" className="rounded-full font-mono text-[10px] gap-1">
                              <Tag className="h-3 w-3" />{coleta.codigo_amostra}
                            </Badge>
                            <Badge className={cn(statusColors[coleta.status], 'rounded-full')}>{statusLabels[coleta.status]}</Badge>
                            {coleta.laboratorio_setores?.nome && <Badge variant="secondary" className="rounded-full">{coleta.laboratorio_setores.nome}</Badge>}
                            {coleta.urgente && <Badge variant="outline" className="rounded-full gap-1 border-warning/40 bg-warning/10 text-warning-foreground"><Zap className="h-3 w-3" />Urgente</Badge>}
                            {coleta.jejum_necessario && <Badge variant="outline" className="rounded-full text-[10px]">Jejum {coleta.jejum_horas}h</Badge>}
                            {(coleta as any).procedimento_codigo && <Badge variant="outline" className="rounded-full font-mono text-[10px]">{(coleta as any).procedimento_codigo}</Badge>}
                            {(coleta as any).numero_guia && <Badge variant="secondary" className="rounded-full text-[10px]">Guia: {(coleta as any).numero_guia}</Badge>}
                            {previsao && (
                              previsao.atrasado
                                ? <Badge variant="outline" className="rounded-full border-destructive/40 bg-destructive/10 text-xs text-destructive">Atrasado · previsto para {formatDateTimeSaoPaulo(previsao.previstoPara)}</Badge>
                                : <span className="text-xs text-muted-foreground">Previsto para {formatDateTimeSaoPaulo(previsao.previstoPara)}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span>{coleta.tipo_amostra}</span>
                            {(coleta as any).material && <span>• {(coleta as any).material}</span>}
                            {coleta.tubo && <span>• {coleta.tubo}</span>}
                            {coleta.volume_ml && <span>• {coleta.volume_ml}mL</span>}
                            {coleta.sitio_coleta && <span>• {coleta.sitio_coleta}</span>}
                            {coleta.medicos?.nome && <span>• {nomeMedico(coleta.medicos.nome)}</span>}
                            {(coleta as any).cid && <span>• CID: {(coleta as any).cid}</span>}
                            {coleta.created_at && (
                              <span className={cn('flex items-center gap-1', getSLAColor(coleta))}>
                                <Timer className="h-3 w-3" />{getSLALabel(coleta.created_at)}
                              </span>
                            )}
                          </div>
                          {coleta.condicao_amostra?.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {coleta.condicao_amostra.map((c: string) => (
                                <Badge key={c} variant="destructive" className="rounded-full text-[10px]">{c}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {nextStatus && coleta.status !== 'cancelado' && (
                            <Button size="sm" variant="outline" className="min-h-11 rounded-full text-xs gap-1"
                              disabled={updateStatus.isPending}
                              onClick={() => updateStatus.mutate({ id: coleta.id, status: nextStatus, expectedStatus: coleta.status })}>
                              <ArrowRight aria-hidden="true" className="h-3 w-3" /> {statusLabels[nextStatus]}
                            </Button>
                          )}
                          {coleta.status === 'validado' && (
                            <Button asChild size="sm" variant="outline" className="min-h-11 rounded-full text-xs gap-1">
                              <Link to={`/laudos-lab/${encodeURIComponent(coleta.id)}`} aria-label={`Liberar laudo da amostra ${coleta.codigo_amostra ?? ''}`}><FileText aria-hidden="true" className="h-3 w-3" />Liberar laudo</Link>
                            </Button>
                          )}
                          {whatsLink && (
                            <Button asChild size="sm" variant="outline" className="h-11 w-11 rounded-full p-0">
                              <a href={whatsLink} target="_blank" rel="noopener noreferrer" aria-label={`Chamar ${coleta.pacientes?.nome ?? 'paciente'} no WhatsApp`} title="Chamar no WhatsApp">
                                <Phone aria-hidden="true" className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="min-h-11 rounded-full text-xs gap-1"
                            onClick={() => navigate(`/laboratorio/coletas/${coleta.id}/resultados`, { state: { laboratorioSearch: location.search, buscaPaciente: search } })}>
                            <Eye aria-hidden="true" className="h-3 w-3" /> Resultados
                          </Button>
                          {(coleta.status === 'pendente' || coleta.status === 'recoleta') && (
                            <Button size="icon" variant="ghost" className="h-11 w-11 rounded-full text-destructive hover:text-destructive"
                              aria-label={`Cancelar coleta ${coleta.codigo_amostra ?? ''}`} title="Cancelar coleta"
                              disabled={updateStatus.isPending}
                              onClick={() => { setMotivoCancelamento(''); setColetaParaCancelar({ id: coleta.id, status: coleta.status, codigo: coleta.codigo_amostra ?? '', observacoes: coleta.observacoes ?? null }); }}>
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {coletasQuery.hasNextPage && (
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/20 p-4 text-center">
              <p className="text-xs text-muted-foreground">
                {coletas?.length ?? 0} coletas carregadas. Há registros anteriores que ainda não entraram na busca.
              </p>
              <Button
                variant="outline"
                onClick={() => void coletasQuery.fetchNextPage()}
                disabled={coletasQuery.isFetchingNextPage}
                className="gap-2"
              >
                {coletasQuery.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {coletasQuery.isFetchingNextPage ? 'Carregando...' : 'Carregar coletas anteriores'}
              </Button>
            </div>
          )}
          </>}
        </TabsContent>

        {/* ─── Pipeline Tab ─── */}
        <TabsContent value="pipeline" className="space-y-4">
          <section aria-labelledby="lab-pipeline-summary-title" className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="lab-pipeline-summary-title" className="text-base font-semibold">Resumo de hoje</h2>
                <p className="text-sm text-muted-foreground">
                  {stats.total > 0 ? 'Selecione um indicador para abrir a Worklist filtrada.' : 'Nenhuma amostra ativa ou concluída hoje.'}
                </p>
              </div>
              {stats.total > 0 && (
                <p className="text-sm text-muted-foreground">Conclusão: <span className="font-semibold text-foreground">{completionRate}%</span> · {stats.liberados + stats.validados} de {stats.total} amostras</p>
              )}
            </div>
            {stats.total > 0 && <Progress value={completionRate} className="h-2" />}
            <div data-testid="lab-pipeline-kpis" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {[
                { label: 'Pendente', value: stats.pendentes, icon: Clock, color: 'text-foreground', bg: 'bg-secondary', filter: 'pendente' },
                { label: 'Coletado', value: stats.coletados, icon: TestTube, color: 'text-foreground', bg: 'bg-secondary', filter: 'coletado' },
                { label: 'Em análise', value: stats.emAnalise, icon: Activity, color: 'text-foreground', bg: 'bg-secondary', filter: 'em_analise' },
                { label: 'Validado', value: stats.validados, icon: Shield, color: 'text-foreground', bg: 'bg-secondary', filter: 'validado' },
                { label: 'Liberado', value: stats.liberados, icon: CheckCircle2, color: 'text-foreground', bg: 'bg-secondary', filter: 'liberado' },
                { label: 'Urgentes', value: stats.urgentes, icon: Zap, color: 'text-warning-foreground', bg: 'bg-warning/10', filter: 'urgente' },
              ].map((s) => (
                <div key={s.label}>
                  <button
                    type="button"
                    className={cn(
                      'w-full rounded-2xl border border-border/60 bg-card shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                      (statusFilter === s.filter || (s.filter === 'urgente' && urgentOnly)) && 'ring-2 ring-primary',
                    )}
                    aria-pressed={s.filter === 'urgente' ? urgentOnly : statusFilter === s.filter && dateFilter === 'hoje' && !urgentOnly}
                    onClick={() => filtrarPipeline(s.filter)}
                  >
                    <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', s.bg)}>
                        <s.icon className={cn('h-4 w-4', s.color)} />
                      </div>
                      <div className="text-left">
                        <p className={cn('text-xl font-bold tabular-nums', s.color)}>{s.value}</p>
                        <p className="text-[10px] font-medium text-muted-foreground">{s.label}</p>
                      </div>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </section>
          {stats.total === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card py-12 flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-secondary text-foreground">
                <Activity className="h-7 w-7" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Nenhuma amostra no fluxo hoje</p>
                <p className="text-sm text-muted-foreground mt-1">Registre uma coleta para iniciar o acompanhamento das etapas laboratoriais.</p>
              </div>
              <Button
                className="rounded-full gap-2 bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                onClick={openNewColeta}
              >
                <Plus className="h-4 w-4" /> Registrar coleta
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Visão Kanban do fluxo laboratorial de hoje</p>
                <Button type="button" variant="outline" className="min-h-11 gap-2 rounded-full" onClick={imprimirMapaBancada}>
                  <Printer aria-hidden="true" className="h-4 w-4" /> Imprimir mapa de bancada
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {PIPELINE_STEPS.map(step => {
              const items = (coletas || []).filter((c: any) =>
                c.status === step && c.created_at && dateOnlyInTimeZone(new Date(c.created_at), FUSO_CLINICA) === hojeNaClinica
              );
              const nextStep = getNextStatus(step);
              return (
                <Card key={step} className="min-h-[200px]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-full',
                          step === 'liberado' ? 'bg-foreground' : 'border border-foreground/40 bg-card',
                        )} />
                        {statusLabels[step]}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Vazio</p>
                    ) : items.map((c: any) => (
                      <div key={c.id} className={cn(
                        'rounded-lg border p-2 space-y-1 text-xs',
                        c.urgente && 'border-warning/50'
                      )}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">{c.pacientes?.nome}</span>
                          {c.urgente && <Zap className="h-3 w-3 text-warning-foreground shrink-0" />}
                        </div>
                        <p className="text-muted-foreground font-mono text-[10px]">{c.codigo_amostra}</p>
                        <p className="text-muted-foreground">{c.tipo_amostra} {c.tubo && `· ${c.tubo}`}</p>
                        {nextStep && (
                          <Button size="sm" variant="outline" className="min-h-11 text-xs w-full gap-1"
                            disabled={updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ id: c.id, status: nextStep, expectedStatus: c.status })}>
                            <ArrowRight className="h-2.5 w-2.5" /> {statusLabels[nextStep]}
                          </Button>
                        )}
                        {c.status === 'validado' && (
                          <Button asChild size="sm" variant="outline" className="min-h-11 text-xs w-full gap-1">
                            <Link to={`/laudos-lab/${encodeURIComponent(c.id)}`} aria-label={`Abrir laudo da amostra ${c.codigo_amostra}`}>
                              <FileText className="h-2.5 w-2.5" />Revisar laudo
                            </Link>
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="pedidos" className="space-y-4">
          <PedidosLaboratorioPanel />
        </TabsContent>
        {podeGerenciarLaboratorio && <TabsContent value="gestao" className="space-y-4"><GestaoLaboratorioPanel /></TabsContent>}
        <TabsContent value="indicadores" className="space-y-4"><IndicadoresLaboratorioPanel /></TabsContent>
      </Tabs>

      <AlertDialog open={!!coletaParaCancelar} onOpenChange={(aberto) => { if (!aberto && !updateStatus.isPending) setColetaParaCancelar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a coleta {coletaParaCancelar?.codigo}?</AlertDialogTitle>
            <AlertDialogDescription>A amostra sai da worklist. Informe o motivo; ele fica registrado nas observações da coleta.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="lab-motivo-cancelamento">Motivo do cancelamento *</Label>
            <Textarea id="lab-motivo-cancelamento" value={motivoCancelamento} onChange={(event) => setMotivoCancelamento(event.target.value)} maxLength={300} rows={3} placeholder="Ex.: pedido duplicado, paciente desistiu" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateStatus.isPending}>Manter coleta</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={updateStatus.isPending || motivoCancelamento.trim().length < 5}
              onClick={(event) => {
                event.preventDefault();
                if (!coletaParaCancelar) return;
                updateStatus.mutate({ id: coletaParaCancelar.id, status: 'cancelado', expectedStatus: coletaParaCancelar.status, motivo: motivoCancelamento, observacoesAtuais: coletaParaCancelar.observacoes });
              }}
            >
              {updateStatus.isPending && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
              Cancelar coleta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
