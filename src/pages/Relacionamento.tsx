import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  CalendarClock, HeartHandshake, Loader2, Mail, MessageCircle, MessageSquareQuote, Pencil, Plus,
  RefreshCw, Send, Smile, Stethoscope, TrendingUp, UserRoundX, Users, X, Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AccessibleChartTable } from '@/components/analytics/AccessibleChartTable';
import { TableSkeleton } from '@/components/ui/loading-skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buscarEmBlocos } from '@/lib/buscarEmBlocos';
import { cn } from '@/lib/utils';
import {
  CANAIS_CAMPANHA, LIMITE_DESTINATARIOS, MENSAGEM_PADRAO, PERIODOS_NPS, PUBLICOS_CAMPANHA, ROTULO_CANAL,
  ROTULO_PUBLICO, ROTULO_STATUS, VARIAVEIS_CAMPANHA, calcularNps, classificarNota, descricaoPublico,
  evolucaoMensal, inserirVariavel, leituraNps, normalizarPrevia, npsPorMedico, previaMensagem,
  resumoResultado, validarRascunho,
  type CanalCampanha, type LinhaNpsMensal, type PeriodoNps, type PreviaPublico, type PublicoCampanha,
  type RascunhoCampanha, type ResultadoFila, type StatusCampanha,
} from '@/lib/relacionamento';

// As tabelas e RPCs desta tela vêm da migration 20261031122000; o cliente
// tipado ainda não conhece todas as relações usadas aqui.
const db = supabase as any;

const COR_GRADE = 'hsl(var(--border))';
const ABAS = ['nps', 'campanhas', 'sem-retorno'] as const;
type Aba = (typeof ABAS)[number];

type Campanha = RascunhoCampanha & {
  id: string;
  status: StatusCampanha;
  total_destinatarios: number;
  disparada_em: string | null;
  created_at: string;
};

type FeedbackLinha = {
  id: string;
  nota: number;
  comentario: string | null;
  created_at: string | null;
  medico_id: string | null;
  medicos?: { nome: string | null } | null;
  pacientes?: { nome: string | null } | null;
};

type SemRetorno = {
  paciente_id: string;
  nome: string;
  ultima_consulta: string;
  dias_sem_consulta: number;
  telefone_final: string | null;
  tem_email: boolean;
};

function formatarData(valor: string | null | undefined, comHora = false) {
  if (!valor) return '—';
  const data = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T12:00:00`) : new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-BR', comHora
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function paraInputLocal(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function novoRascunho(publico: PublicoCampanha = 'ativos', dias = 180): RascunhoCampanha {
  return {
    nome: '',
    canal: 'whatsapp',
    publico,
    publico_dias: dias,
    mensagem: MENSAGEM_PADRAO[publico],
    agendada_para: null,
  };
}

function IconeQuadrado({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-foreground [&_svg]:h-4 [&_svg]:w-4', className)}>
      {children}
    </span>
  );
}

function BotoesSegmentados<T extends string | number>({ rotulo, opcoes, valor, onChange, formatar }: {
  rotulo: string;
  opcoes: readonly T[];
  valor: T;
  onChange: (v: T) => void;
  formatar: (v: T) => string;
}) {
  return (
    <div role="group" aria-label={rotulo} className="inline-flex rounded-lg border border-border bg-card p-0.5">
      {opcoes.map((opcao) => (
        <button
          key={String(opcao)}
          type="button"
          aria-pressed={valor === opcao}
          onClick={() => onChange(opcao)}
          className={cn(
            'h-8 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            valor === opcao ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {formatar(opcao)}
        </button>
      ))}
    </div>
  );
}

function BadgeStatus({ status }: { status: StatusCampanha }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full font-medium',
        status === 'rascunho' && 'border-border text-muted-foreground',
        status === 'agendada' && 'border-border bg-secondary text-foreground',
        status === 'enviada' && 'border-transparent bg-primary text-primary-foreground',
        status === 'cancelada' && 'border-border text-muted-foreground line-through',
      )}
    >
      {ROTULO_STATUS[status]}
    </Badge>
  );
}

export default function Relacionamento() {
  const { profile, isAdmin } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id ?? null;
  const admin = isAdmin();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const pedida = searchParams.get('tab') as Aba | null;
  const aba: Aba = pedida && ABAS.includes(pedida) ? pedida : 'nps';
  const trocarAba = (valor: string) => setSearchParams((anterior) => {
    const proximo = new URLSearchParams(anterior);
    if (valor === 'nps') proximo.delete('tab');
    else proximo.set('tab', valor);
    return proximo;
  }, { replace: true });

  const [periodo, setPeriodo] = useState<PeriodoNps>(90);
  const [diasSemRetorno, setDiasSemRetorno] = useState(180);
  const [rascunho, setRascunho] = useState<RascunhoCampanha | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [disparo, setDisparo] = useState<{ campanha: Campanha; total: number } | null>(null);
  const [disparando, setDisparando] = useState(false);
  const [cancelamento, setCancelamento] = useState<Campanha | null>(null);
  const mensagemRef = useRef<HTMLTextAreaElement>(null);

  // ─── NPS ────────────────────────────────────────────────
  const feedbacksQuery = useQuery({
    queryKey: ['relacionamento-nps', clinicaId, periodo],
    enabled: !!clinicaId,
    queryFn: async () => {
      const desde = new Date(Date.now() - periodo * 86_400_000).toISOString();
      return buscarEmBlocos<FeedbackLinha>(() => db.from('feedbacks_nps')
        .select('id, nota, comentario, created_at, medico_id, medicos(nome), pacientes(nome)')
        .eq('clinica_id', clinicaId)
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .order('id'));
    },
  });
  const feedbacks = useMemo(() => feedbacksQuery.data ?? [], [feedbacksQuery.data]);

  const mensalQuery = useQuery({
    queryKey: ['relacionamento-nps-mensal', clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      const inicio = new Date();
      inicio.setMonth(inicio.getMonth() - 11, 1);
      inicio.setHours(0, 0, 0, 0);
      const { data, error } = await db.from('nps_resumo_mensal')
        .select('mes, total, promotores, neutros, detratores')
        .eq('clinica_id', clinicaId)
        .gte('mes', inicio.toISOString())
        .order('mes');
      if (error) throw error;
      return (data ?? []) as LinhaNpsMensal[];
    },
  });

  const resumo = useMemo(() => calcularNps(feedbacks.map((f) => f.nota)), [feedbacks]);
  const evolucao = useMemo(() => evolucaoMensal(mensalQuery.data ?? []), [mensalQuery.data]);
  const porMedico = useMemo(() => npsPorMedico(feedbacks.map((f) => ({
    nota: f.nota, created_at: f.created_at, medico_id: f.medico_id, medico_nome: f.medicos?.nome ?? null,
  }))), [feedbacks]);
  const comentarios = useMemo(() => feedbacks.filter((f) => f.comentario?.trim()).slice(0, 8), [feedbacks]);

  // ─── Campanhas ──────────────────────────────────────────
  const campanhasQuery = useQuery({
    queryKey: ['relacionamento-campanhas', clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      const { data, error } = await db.from('campanhas')
        .select('id, nome, canal, publico, publico_dias, mensagem, agendada_para, status, total_destinatarios, disparada_em, created_at')
        .eq('clinica_id', clinicaId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Campanha[];
    },
  });
  const campanhas = campanhasQuery.data ?? [];

  const resultadoQuery = useQuery({
    queryKey: ['relacionamento-resultado', clinicaId],
    enabled: !!clinicaId && campanhas.some((c) => c.status !== 'rascunho'),
    queryFn: async () => {
      const { data, error } = await db.rpc('resultado_campanhas');
      if (error) throw error;
      return new Map(((data ?? []) as ResultadoFila[]).map((r) => [r.campanha_id, r]));
    },
  });

  const previaQuery = useQuery({
    queryKey: ['relacionamento-previa', clinicaId, rascunho?.publico, rascunho?.publico_dias, rascunho?.canal],
    enabled: !!clinicaId && !!rascunho,
    queryFn: async () => {
      const { data, error } = await db.rpc('previa_publico_campanha', {
        p_publico: rascunho!.publico, p_dias: rascunho!.publico_dias, p_canal: rascunho!.canal,
      });
      if (error) throw error;
      return normalizarPrevia(data);
    },
  });

  // ─── Sem retorno ────────────────────────────────────────
  const semRetornoQuery = useQuery({
    queryKey: ['relacionamento-sem-retorno', clinicaId, diasSemRetorno],
    enabled: !!clinicaId && aba === 'sem-retorno',
    queryFn: async () => {
      const { data, error } = await db.rpc('listar_pacientes_sem_retorno', { p_dias: diasSemRetorno, p_limite: 200 });
      if (error) throw error;
      return (data ?? []) as SemRetorno[];
    },
  });

  const abrirEditor = (inicial: RascunhoCampanha) => {
    setRascunho(inicial);
    trocarAba('campanhas');
  };

  const atualizar = (parcial: Partial<RascunhoCampanha>) => setRascunho((r) => (r ? { ...r, ...parcial } : r));

  const trocarPublico = (publico: PublicoCampanha) => setRascunho((r) => {
    if (!r) return r;
    const mensagemEraPadrao = Object.values(MENSAGEM_PADRAO).includes(r.mensagem);
    return {
      ...r,
      publico,
      publico_dias: publico === 'detratores_nps' && r.publico !== 'detratores_nps' ? 90 : r.publico_dias,
      mensagem: mensagemEraPadrao ? MENSAGEM_PADRAO[publico] : r.mensagem,
    };
  });

  const colocarVariavel = (token: string) => {
    if (!rascunho) return;
    const campo = mensagemRef.current;
    const { texto, cursor } = inserirVariavel(rascunho.mensagem, token, campo?.selectionStart ?? undefined, campo?.selectionEnd ?? undefined);
    atualizar({ mensagem: texto });
    requestAnimationFrame(() => {
      campo?.focus();
      campo?.setSelectionRange(cursor, cursor);
    });
  };

  const recarregarCampanhas = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['relacionamento-campanhas'] }),
    queryClient.invalidateQueries({ queryKey: ['relacionamento-resultado'] }),
  ]);

  const salvarRascunho = async (): Promise<Campanha | null> => {
    if (!rascunho || !clinicaId) return null;
    const problema = validarRascunho(rascunho);
    if (problema) { toast.error(problema); return null; }
    setSalvando(true);
    try {
      const dados = {
        nome: rascunho.nome.trim(),
        canal: rascunho.canal,
        publico: rascunho.publico,
        publico_dias: rascunho.publico_dias,
        mensagem: rascunho.mensagem.trim(),
        agendada_para: rascunho.agendada_para,
      };
      const consulta = rascunho.id
        ? db.from('campanhas').update(dados).eq('id', rascunho.id).eq('status', 'rascunho')
        : db.from('campanhas').insert({ ...dados, clinica_id: clinicaId });
      const { data, error } = await consulta
        .select('id, nome, canal, publico, publico_dias, mensagem, agendada_para, status, total_destinatarios, disparada_em, created_at')
        .single();
      if (error) throw error;
      setRascunho({ ...rascunho, id: data.id });
      await recarregarCampanhas();
      toast.success('Rascunho salvo.');
      return data as Campanha;
    } catch (erro: any) {
      toast.error('Não foi possível salvar o rascunho.', { description: erro?.message });
      return null;
    } finally {
      setSalvando(false);
    }
  };

  const pedirDisparo = async (campanha: Campanha) => {
    try {
      const { data, error } = await db.rpc('previa_publico_campanha', {
        p_publico: campanha.publico, p_dias: campanha.publico_dias, p_canal: campanha.canal,
      });
      if (error) throw error;
      const { total } = normalizarPrevia(data);
      if (total === 0) { toast.error('Nenhum paciente elegível para este público e canal.'); return; }
      if (total > LIMITE_DESTINATARIOS) {
        toast.error(`O público tem ${total.toLocaleString('pt-BR')} pacientes e o limite por disparo é ${LIMITE_DESTINATARIOS.toLocaleString('pt-BR')}.`);
        return;
      }
      setDisparo({ campanha, total });
    } catch (erro: any) {
      toast.error('Não foi possível conferir o público.', { description: erro?.message });
    }
  };

  const salvarEDisparar = async () => {
    const salva = await salvarRascunho();
    if (salva) await pedirDisparo(salva);
  };

  const disparar = async () => {
    if (!disparo) return;
    setDisparando(true);
    try {
      const { data, error } = await db.rpc('disparar_campanha', { p_campanha_id: disparo.campanha.id });
      if (error) throw error;
      const status = data?.status === 'agendada' ? 'agendada' : 'na fila de envio';
      toast.success(`Campanha ${status} para ${Number(data?.total ?? disparo.total).toLocaleString('pt-BR')} paciente(s).`);
      setDisparo(null);
      if (rascunho?.id === disparo.campanha.id) setRascunho(null);
      await recarregarCampanhas();
    } catch (erro: any) {
      toast.error('Não foi possível disparar a campanha.', { description: erro?.message });
    } finally {
      setDisparando(false);
    }
  };

  const cancelar = async () => {
    if (!cancelamento) return;
    try {
      const { data, error } = await db.rpc('cancelar_campanha', { p_campanha_id: cancelamento.id });
      if (error) throw error;
      toast.success(`Campanha cancelada. ${Number(data?.cancelados ?? 0)} envio(s) pendente(s) retirados da fila.`);
      if (rascunho?.id === cancelamento.id) setRascunho(null);
      await recarregarCampanhas();
    } catch (erro: any) {
      toast.error('Não foi possível cancelar a campanha.', { description: erro?.message });
    } finally {
      setCancelamento(null);
    }
  };

  const previa: PreviaPublico | undefined = previaQuery.data;
  const mensagemPrevia = rascunho ? previaMensagem(rascunho.mensagem, previa) : null;
  const usaDias = rascunho?.publico === 'sem_retorno' || rascunho?.publico === 'detratores_nps';

  if (!clinicaId) {
    return (
      <div className="space-y-5 pb-8">
        <PageHeader title="Campanhas e NPS" icon={<HeartHandshake />} />
        <ErrorState title="Clínica não identificada" description="Não foi possível identificar a clínica atual para carregar as campanhas." />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Campanhas e NPS"
        description="Acompanhe a satisfação dos pacientes e envie campanhas pelo WhatsApp ou e-mail, respeitando o canal que cada paciente aceitou."
        icon={<HeartHandshake />}
        actions={(
          <Button className="gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => abrirEditor(novoRascunho())}>
            <Plus className="h-4 w-4" /> Nova campanha
          </Button>
        )}
      />

      <Tabs value={aba} onValueChange={trocarAba} className="space-y-5">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-border bg-muted/60 p-1 text-muted-foreground">
          <TabsTrigger value="nps" className="min-h-10 gap-2 rounded-lg"><Smile className="h-4 w-4" /> NPS</TabsTrigger>
          <TabsTrigger value="campanhas" className="min-h-10 gap-2 rounded-lg"><Send className="h-4 w-4" /> Campanhas</TabsTrigger>
          <TabsTrigger value="sem-retorno" className="min-h-10 gap-2 rounded-lg"><UserRoundX className="h-4 w-4" /> Sem retorno</TabsTrigger>
        </TabsList>

        {/* ─── Aba NPS ─── */}
        <TabsContent value="nps" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <BotoesSegmentados<PeriodoNps>
              rotulo="Período do NPS"
              opcoes={PERIODOS_NPS}
              valor={periodo}
              onChange={setPeriodo}
              formatar={(d) => (d === 365 ? '12 meses' : `${d} dias`)}
            />
            <Button variant="outline" size="icon" className="rounded-lg" aria-label="Atualizar NPS" title="Atualizar NPS"
              onClick={() => { void feedbacksQuery.refetch(); void mensalQuery.refetch(); }} disabled={feedbacksQuery.isFetching}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {feedbacksQuery.isError ? (
            <ErrorState title="Não foi possível carregar as avaliações" error={feedbacksQuery.error} onRetry={() => void feedbacksQuery.refetch()} />
          ) : feedbacksQuery.isLoading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-12">
              <Card className="border-border bg-card lg:col-span-4">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <IconeQuadrado><Smile /></IconeQuadrado> NPS do período
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end gap-3">
                    <p className="font-display text-5xl font-semibold tabular-nums tracking-tight" data-testid="nps-valor">
                      {resumo.nps === null ? '—' : resumo.nps}
                    </p>
                    <div className="pb-1.5 text-sm">
                      <p className={cn('font-medium', resumo.nps !== null && resumo.nps < 0 ? 'text-destructive' : 'text-foreground')}>{leituraNps(resumo.nps)}</p>
                      <p className="text-xs text-muted-foreground">{resumo.total} avaliação(ões)</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img"
                      aria-label={`Promotores ${resumo.pctPromotores}%, neutros ${resumo.pctNeutros}%, detratores ${resumo.pctDetratores}%`}>
                      <div className="h-full bg-primary" style={{ width: `${resumo.pctPromotores}%` }} />
                      <div className="h-full bg-muted-foreground/40" style={{ width: `${resumo.pctNeutros}%` }} />
                      <div className="h-full bg-destructive" style={{ width: `${resumo.pctDetratores}%` }} />
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      {[
                        { rotulo: 'Promotores', nota: 'nota 5', qtd: resumo.promotores, pct: resumo.pctPromotores, cor: 'bg-primary' },
                        { rotulo: 'Neutros', nota: 'notas 3 e 4', qtd: resumo.neutros, pct: resumo.pctNeutros, cor: 'bg-muted-foreground/40' },
                        { rotulo: 'Detratores', nota: 'notas 1 e 2', qtd: resumo.detratores, pct: resumo.pctDetratores, cor: 'bg-destructive' },
                      ].map((item) => (
                        <div key={item.rotulo} className="rounded-lg border border-border p-2">
                          <dt className="flex items-center gap-1.5 font-medium text-foreground">
                            <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', item.cor)} /> {item.rotulo}
                          </dt>
                          <dd className={cn('mt-1 text-base font-semibold tabular-nums', item.rotulo === 'Detratores' && item.qtd > 0 && 'text-destructive')}>
                            {item.qtd} <span className="text-xs font-normal text-muted-foreground">({item.pct}%)</span>
                          </dd>
                          <dd className="text-[11px] text-muted-foreground">{item.nota}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full gap-2 rounded-lg"
                    disabled={resumo.detratores === 0}
                    onClick={() => abrirEditor({ ...novoRascunho('detratores_nps', periodo), nome: 'Retomar contato com detratores' })}
                  >
                    <Send className="h-4 w-4" /> Criar campanha para detratores
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border bg-card lg:col-span-8">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <IconeQuadrado><TrendingUp /></IconeQuadrado> Evolução mensal (12 meses)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {mensalQuery.isError ? (
                    <ErrorState compact error={mensalQuery.error} onRetry={() => void mensalQuery.refetch()} />
                  ) : evolucao.length === 0 ? (
                    <p className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">Ainda não há avaliações nos últimos 12 meses.</p>
                  ) : (
                    <>
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={evolucao} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} vertical={false} />
                            <XAxis dataKey="rotulo" tickLine={false} axisLine={false} className="text-xs" />
                            <YAxis domain={[-100, 100]} tickLine={false} axisLine={false} className="text-xs" />
                            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                            <Tooltip
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              formatter={(valor: number, _nome, item: any) => [`${valor} (${item?.payload?.total ?? 0} avaliações)`, 'NPS']}
                            />
                            <Line type="monotone" dataKey="nps" name="NPS" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <AccessibleChartTable
                        title="Evolução mensal do NPS"
                        period="Últimos 12 meses"
                        filters={[]}
                        columns={[{ key: 'mes', label: 'Mês' }, { key: 'nps', label: 'NPS' }, { key: 'total', label: 'Avaliações' }]}
                        rows={evolucao.map((e) => ({ mes: e.rotulo, nps: e.nps ?? '—', total: e.total }))}
                      />
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border bg-card lg:col-span-6">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <IconeQuadrado><Stethoscope /></IconeQuadrado> NPS por profissional
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {porMedico.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Sem avaliações no período.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {porMedico.slice(0, 10).map((m) => (
                        <li key={m.id} className="flex items-center gap-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{m.nome}</p>
                            <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                              <div className="h-full bg-primary" style={{ width: `${m.pctPromotores}%` }} />
                              <div className="h-full bg-muted-foreground/40" style={{ width: `${m.pctNeutros}%` }} />
                              <div className="h-full bg-destructive" style={{ width: `${m.pctDetratores}%` }} />
                            </div>
                          </div>
                          <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">{m.total} aval.</span>
                          <span className={cn('w-12 text-right text-base font-semibold tabular-nums', (m.nps ?? 0) < 0 && 'text-destructive')}>
                            {m.nps ?? '—'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border bg-card lg:col-span-6">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <IconeQuadrado><MessageSquareQuote /></IconeQuadrado> Últimos comentários
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {comentarios.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Nenhum comentário no período.</p>
                  ) : (
                    <ul className="space-y-2">
                      {comentarios.map((c) => {
                        const detrator = classificarNota(c.nota) === 'detrator';
                        return (
                          <li key={c.id} className="rounded-lg border border-border p-3">
                            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{c.pacientes?.nome || 'Paciente'} · {c.medicos?.nome || 'Sem profissional'}</span>
                              <span className="shrink-0">{formatarData(c.created_at)}</span>
                            </div>
                            <p className="mt-1 text-sm text-foreground">{c.comentario}</p>
                            <Badge variant="outline" className={cn('mt-2 rounded-full', detrator && 'border-destructive/40 bg-destructive/5 text-destructive')}>
                              Nota {c.nota} de 5
                            </Badge>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ─── Aba Campanhas ─── */}
        <TabsContent value="campanhas" className="mt-0">
          <div className={cn('grid gap-4', rascunho && 'xl:grid-cols-12')}>
            <Card className={cn('border-border bg-card', rascunho && 'xl:col-span-5')}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <IconeQuadrado><Send /></IconeQuadrado> Campanhas
                  <Badge variant="outline" className="rounded-full">{campanhas.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {campanhasQuery.isError ? (
                  <ErrorState title="Não foi possível carregar as campanhas" error={campanhasQuery.error} onRetry={() => void campanhasQuery.refetch()} />
                ) : campanhasQuery.isLoading ? (
                  <TableSkeleton rows={4} cols={4} />
                ) : campanhas.length === 0 ? (
                  <EmptyState
                    icon={Send}
                    title="Nenhuma campanha ainda"
                    description="Crie um rascunho, confira o público e a prévia da mensagem e dispare quando estiver pronto."
                    action={{ label: 'Criar campanha', onClick: () => abrirEditor(novoRascunho()), icon: Plus }}
                    className="border-border"
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Campanha</TableHead>
                          <TableHead>Situação</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Resultado</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {campanhas.map((c) => {
                          const r = resumoResultado(resultadoQuery.data?.get(c.id));
                          return (
                            <TableRow key={c.id} className={cn(rascunho?.id === c.id && 'bg-muted/50')}>
                              <TableCell>
                                <p className="font-medium">{c.nome}</p>
                                <p className="text-xs text-muted-foreground">
                                  {ROTULO_CANAL[c.canal]} · {ROTULO_PUBLICO[c.publico]}
                                  {c.agendada_para && ` · ${formatarData(c.agendada_para, true)}`}
                                </p>
                              </TableCell>
                              <TableCell><BadgeStatus status={c.status} /></TableCell>
                              <TableCell className="text-right tabular-nums">{c.status === 'rascunho' ? '—' : c.total_destinatarios}</TableCell>
                              <TableCell className="text-xs">
                                {c.status === 'rascunho' ? (
                                  <span className="text-muted-foreground">Não disparada</span>
                                ) : (
                                  <span className="flex flex-wrap gap-x-2">
                                    <span>{r.enviados} enviados</span>
                                    <span className={cn(r.erros > 0 ? 'font-medium text-destructive' : 'text-muted-foreground')}>{r.erros} erros</span>
                                    {r.pendentes > 0 && <span className="text-muted-foreground">{r.pendentes} na fila</span>}
                                    {r.cancelados > 0 && <span className="text-muted-foreground">{r.cancelados} cancelados</span>}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  {c.status === 'rascunho' && (
                                    <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setRascunho({ ...c })}>
                                      <Pencil className="h-3.5 w-3.5" /> Editar
                                    </Button>
                                  )}
                                  {admin && c.status === 'rascunho' && (
                                    <Button size="sm" className="h-8 gap-1 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => void pedirDisparo(c)}>
                                      <Send className="h-3.5 w-3.5" /> Disparar
                                    </Button>
                                  )}
                                  {admin && (c.status === 'agendada' || c.status === 'rascunho') && (
                                    <Button size="sm" variant="ghost" className="h-8 gap-1 text-muted-foreground" onClick={() => setCancelamento(c)}>
                                      <Ban className="h-3.5 w-3.5" /> Cancelar
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {rascunho && (
              <Card className="border-border bg-card xl:col-span-7" aria-label="Editor de campanha">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <IconeQuadrado><Pencil /></IconeQuadrado> {rascunho.id ? 'Editar rascunho' : 'Nova campanha'}
                  </CardTitle>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Fechar editor" onClick={() => setRascunho(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="campanha-nome">Nome</Label>
                        <Input id="campanha-nome" value={rascunho.nome} maxLength={120} placeholder="Ex.: Retorno de check-up"
                          onChange={(e) => atualizar({ nome: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Canal</Label>
                        <div>
                          <BotoesSegmentados<CanalCampanha>
                            rotulo="Canal da campanha"
                            opcoes={CANAIS_CAMPANHA}
                            valor={rascunho.canal}
                            onChange={(canal) => atualizar({ canal })}
                            formatar={(c) => ROTULO_CANAL[c]}
                          />
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
                        <div className="space-y-1.5">
                          <Label htmlFor="campanha-publico">Público</Label>
                          <Select value={rascunho.publico} onValueChange={(v) => trocarPublico(v as PublicoCampanha)}>
                            <SelectTrigger id="campanha-publico"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PUBLICOS_CAMPANHA.map((p) => <SelectItem key={p} value={p}>{ROTULO_PUBLICO[p]}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        {usaDias && (
                          <div className="space-y-1.5">
                            <Label htmlFor="campanha-dias">Dias</Label>
                            <Input id="campanha-dias" type="number" min={1} max={3650} value={rascunho.publico_dias}
                              onChange={(e) => atualizar({ publico_dias: Math.max(1, Math.min(3650, Number(e.target.value) || 1)) })} />
                          </div>
                        )}
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-3" aria-live="polite">
                        <p className="text-xs text-muted-foreground">{descricaoPublico(rascunho.publico, rascunho.publico_dias)}</p>
                        {previaQuery.isError ? (
                          <p className="mt-1 text-sm text-destructive">Não foi possível calcular o público.</p>
                        ) : previaQuery.isLoading || !previa ? (
                          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando público…</p>
                        ) : (
                          <>
                            <p className="mt-1 text-sm">
                              <strong className="tabular-nums" data-testid="previa-total">{previa.total.toLocaleString('pt-BR')}</strong> paciente(s) receberão por {ROTULO_CANAL[rascunho.canal]}
                            </p>
                            {previa.total > LIMITE_DESTINATARIOS && (
                              <p className="mt-1 text-xs font-medium text-destructive">Acima do limite de {LIMITE_DESTINATARIOS.toLocaleString('pt-BR')} por disparo. Use um público menor.</p>
                            )}
                            {previa.amostra.length > 0 && (
                              <ul className="mt-2 flex flex-wrap gap-1" aria-label="Amostra do público">
                                {previa.amostra.slice(0, 10).map((p) => (
                                  <li key={p.id} className="rounded-full border border-border bg-card px-2 py-0.5 text-xs">{p.nome}</li>
                                ))}
                                {previa.total > 10 && <li className="px-1 py-0.5 text-xs text-muted-foreground">e mais {(previa.total - 10).toLocaleString('pt-BR')}</li>}
                              </ul>
                            )}
                            <p className="mt-2 text-[11px] text-muted-foreground">Ficam de fora quem não tem contato válido no canal ou escolheu não receber por ele.</p>
                          </>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="campanha-data">Data de envio (opcional)</Label>
                        <Input id="campanha-data" type="datetime-local" value={paraInputLocal(rascunho.agendada_para)}
                          onChange={(e) => atualizar({ agendada_para: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                        <p className="text-[11px] text-muted-foreground">Sem data, o envio começa ao disparar, dentro da janela de contato de cada paciente.</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="campanha-mensagem">Mensagem</Label>
                        <div className="flex flex-wrap gap-1" role="group" aria-label="Inserir variável">
                          {VARIAVEIS_CAMPANHA.map((v) => (
                            <Button key={v.token} type="button" size="sm" variant="outline" className="h-7 rounded-md px-2 text-xs"
                              onClick={() => colocarVariavel(v.token)}>
                              <Plus className="mr-1 h-3 w-3" /> {v.rotulo}
                            </Button>
                          ))}
                        </div>
                        <Textarea id="campanha-mensagem" ref={mensagemRef} rows={6} maxLength={2000} value={rascunho.mensagem}
                          onChange={(e) => atualizar({ mensagem: e.target.value })} />
                        <p className="text-right text-[11px] text-muted-foreground">{rascunho.mensagem.length}/2000</p>
                      </div>
                      {mensagemPrevia && (
                        <div className="space-y-1.5">
                          <p className="text-sm font-medium">Prévia</p>
                          <div className="rounded-lg border border-border bg-muted/30 p-3">
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              {rascunho.canal === 'whatsapp' ? <MessageCircle className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                              Para {mensagemPrevia.destinatario}{mensagemPrevia.exemplo && ' (exemplo)'}
                            </p>
                            <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-card p-3 text-sm" data-testid="previa-mensagem">
                              {mensagemPrevia.texto}
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap justify-end gap-2 pt-1">
                        <Button variant="outline" className="rounded-lg" onClick={() => setRascunho(null)}>Fechar</Button>
                        <Button variant="outline" className="gap-2 rounded-lg" disabled={salvando} onClick={() => void salvarRascunho()}>
                          {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar rascunho
                        </Button>
                        {admin && (
                          <Button className="gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90" disabled={salvando}
                            onClick={() => void salvarEDisparar()}>
                            <Send className="h-4 w-4" /> Disparar
                          </Button>
                        )}
                      </div>
                      {!admin && <p className="text-right text-[11px] text-muted-foreground">O disparo é feito pelo administrador da clínica.</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ─── Aba Sem retorno ─── */}
        <TabsContent value="sem-retorno" className="mt-0">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <IconeQuadrado><Users /></IconeQuadrado> Pacientes sem retorno
                  {semRetornoQuery.data && <Badge variant="outline" className="rounded-full">{semRetornoQuery.data.length}</Badge>}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <BotoesSegmentados<number>
                    rotulo="Sem consulta há mais de"
                    opcoes={[90, 180, 365]}
                    valor={diasSemRetorno}
                    onChange={setDiasSemRetorno}
                    formatar={(d) => `+${d} dias`}
                  />
                  <Input aria-label="Dias sem consulta" type="number" min={1} max={3650} className="h-9 w-24"
                    value={diasSemRetorno} onChange={(e) => setDiasSemRetorno(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))} />
                  <Button className="gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => abrirEditor({ ...novoRascunho('sem_retorno', diasSemRetorno), nome: `Retorno: sem consulta há ${diasSemRetorno} dias` })}>
                    <Send className="h-4 w-4" /> Criar campanha
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {semRetornoQuery.isError ? (
                <ErrorState title="Não foi possível carregar os pacientes" error={semRetornoQuery.error} onRetry={() => void semRetornoQuery.refetch()} />
              ) : semRetornoQuery.isLoading ? (
                <TableSkeleton rows={5} cols={4} />
              ) : !semRetornoQuery.data?.length ? (
                <EmptyState
                  icon={CalendarClock}
                  title="Nenhum paciente sem retorno"
                  description={`Todos os pacientes com consulta finalizada voltaram nos últimos ${diasSemRetorno} dias ou já têm horário marcado.`}
                  className="border-border"
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Última consulta</TableHead>
                        <TableHead className="text-right">Dias sem consulta</TableHead>
                        <TableHead>Contato</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {semRetornoQuery.data.map((p) => (
                        <TableRow key={p.paciente_id}>
                          <TableCell className="font-medium">{p.nome}</TableCell>
                          <TableCell>{formatarData(p.ultima_consulta)}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.dias_sem_consulta}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <span className="flex flex-wrap gap-x-3">
                              {p.telefone_final && <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> final {p.telefone_final}</span>}
                              {p.tem_email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> e-mail</span>}
                              {!p.telefone_final && !p.tem_email && 'sem contato'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {semRetornoQuery.data.length >= 200 && (
                    <p className="mt-2 text-xs text-muted-foreground">Mostrando os 200 pacientes há mais tempo sem consulta. A campanha considera todos.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!disparo}
        onOpenChange={(aberto) => { if (!aberto && !disparando) setDisparo(null); }}
        title="Disparar campanha"
        description={disparo
          ? `A campanha "${disparo.campanha.nome}" será enviada por ${ROTULO_CANAL[disparo.campanha.canal]} para ${disparo.total.toLocaleString('pt-BR')} paciente(s)${disparo.campanha.agendada_para && Date.parse(disparo.campanha.agendada_para) > Date.now() ? ` a partir de ${formatarData(disparo.campanha.agendada_para, true)}` : ' assim que a fila for processada'}. Depois do disparo, o texto não pode ser alterado.`
          : ''}
        confirmLabel={`Disparar para ${disparo?.total.toLocaleString('pt-BR') ?? 0}`}
        variant="warning"
        isLoading={disparando}
        closeOnConfirm={false}
        onConfirm={() => void disparar()}
      />
      <ConfirmDialog
        open={!!cancelamento}
        onOpenChange={(aberto) => { if (!aberto) setCancelamento(null); }}
        title="Cancelar campanha"
        description={cancelamento?.status === 'agendada'
          ? `Os envios ainda pendentes de "${cancelamento.nome}" serão retirados da fila. Mensagens já enviadas não são desfeitas.`
          : `O rascunho "${cancelamento?.nome ?? ''}" será marcado como cancelado.`}
        confirmLabel="Cancelar campanha"
        cancelLabel="Voltar"
        variant="destructive"
        onConfirm={() => void cancelar()}
      />
    </div>
  );
}
