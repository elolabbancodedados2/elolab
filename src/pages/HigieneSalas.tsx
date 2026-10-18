import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, Clock3, DoorOpen, Loader2, Plus, RefreshCw, Search, ShieldCheck, SprayCan, Timer, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { dateOnlyInTimeZone, todaySaoPauloDateOnly } from '@/lib/dateOnly';

type Room = { id: string; nome: string; status: string; localizacao: string | null };
type Item = { id: string; label: string; required: boolean; completed?: boolean };
type Checklist = { id: string; version: number; title: string; items: Item[]; created_at: string };
type Execution = { id: string; room_id: string; checklist_version_id: string; started_by: string; started_at: string; submitted_by: string | null; submitted_at: string | null; completed_items: Item[] | null; notes: string | null };
type Review = { id: string; execution_id: string; reviewer_id: string; decision: 'approved' | 'rejected'; note: string; created_at: string };
type Data = { rooms: Room[]; activeChecklistId: string | null; checklists: Checklist[]; executions: Execution[]; reviews: Review[]; canReview: boolean; canConfigure: boolean };
type Etapa = 'aguardando' | 'executando' | 'inspecao' | 'liberadas';
type Filtro = Etapa | 'todos';

const EMPTY: Data = { rooms: [], activeChecklistId: null, checklists: [], executions: [], reviews: [], canReview: false, canConfigure: false };
const fmt = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const normalizar = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const plural = (n: number, singular: string, pluralForm: string) => `${n} ${n === 1 ? singular : pluralForm}`;

const STATUS_LABEL: Record<string, string> = { disponivel: 'Disponível', limpeza: 'Em higienização', ocupado: 'Em uso', manutencao: 'Indisponível' };
const STATUS_BADGE: Record<string, string> = {
  disponivel: 'border-success/30 bg-success/10 text-success',
  limpeza: 'border-info/30 bg-info/10 text-info',
  ocupado: 'border-destructive/30 bg-destructive/10 text-destructive',
  manutencao: 'border-warning/30 bg-warning/10 text-warning',
};
const FILTRO_LABEL: Record<Filtro, string> = { todos: 'todas as salas', aguardando: 'salas aguardando limpeza', executando: 'salas em execução', inspecao: 'salas aguardando inspeção', liberadas: 'salas liberadas hoje' };

export default function HigieneSalas() {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('Higienização entre atendimentos');
  const [itemText, setItemText] = useState('Higienizar superfícies de contato\nTrocar descartáveis e forros\nDescartar resíduos conforme protocolo\nRepor materiais para o próximo atendimento');
  const [completed, setCompleted] = useState<Record<string, Record<string, boolean>>>({});
  const [executionNotes, setExecutionNotes] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [configAberta, setConfigAberta] = useState(false);

  const query = useQuery({
    queryKey: ['room-hygiene', profile?.clinica_id],
    enabled: Boolean(profile?.clinica_id),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('higiene-salas', { body: { action: 'list' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as Data;
    },
    refetchInterval: 30_000,
  });
  const data = query.data ?? EMPTY;
  const activeChecklist = useMemo(() => data.checklists.find((item) => item.id === data.activeChecklistId) ?? null, [data]);
  const reviewByExecution = useMemo(() => new Map(data.reviews.map((item) => [item.execution_id, item])), [data.reviews]);
  const openByRoom = useMemo(() => new Map(data.executions.filter((item) => !item.submitted_at).map((item) => [item.room_id, item])), [data.executions]);
  const pendingReview = useMemo(() => data.executions
    .filter((item) => item.submitted_at && !reviewByExecution.has(item.id))
    .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at))), [data.executions, reviewByExecution]);
  const pendingReviewRoomIds = useMemo(() => new Set(pendingReview.map((item) => item.room_id)), [pendingReview]);
  const pendingByRoom = useMemo(() => new Map(pendingReview.map((item) => [item.room_id, item])), [pendingReview]);
  const liberadasHojeRoomIds = useMemo(() => {
    const hoje = todaySaoPauloDateOnly();
    const executionById = new Map(data.executions.map((item) => [item.id, item]));
    const ids = new Set<string>();
    for (const review of data.reviews) {
      if (review.decision !== 'approved' || dateOnlyInTimeZone(new Date(review.created_at), 'America/Sao_Paulo') !== hoje) continue;
      const roomId = executionById.get(review.execution_id)?.room_id;
      if (roomId) ids.add(roomId);
    }
    return ids;
  }, [data.executions, data.reviews]);

  const etapaDaSala = (room: Room): Etapa | null => {
    if (pendingReviewRoomIds.has(room.id)) return 'inspecao';
    if (openByRoom.has(room.id)) return 'executando';
    if (room.status === 'limpeza') return 'aguardando';
    if (liberadasHojeRoomIds.has(room.id)) return 'liberadas';
    return null;
  };
  const stats = useMemo(() => {
    const base: Record<Etapa, number> = { aguardando: 0, executando: 0, inspecao: 0, liberadas: 0 };
    for (const room of data.rooms) {
      if (pendingReviewRoomIds.has(room.id)) base.inspecao += 1;
      else if (openByRoom.has(room.id)) base.executando += 1;
      else if (room.status === 'limpeza') base.aguardando += 1;
      if (liberadasHojeRoomIds.has(room.id)) base.liberadas += 1;
    }
    return base;
  }, [data.rooms, pendingReviewRoomIds, openByRoom, liberadasHojeRoomIds]);

  const termo = normalizar(search);
  const salasFiltradas = data.rooms.filter((room) => {
    if (termo && !normalizar(`${room.nome} ${room.localizacao ?? ''}`).includes(termo)) return false;
    if (filtro === 'todos') return true;
    if (filtro === 'liberadas') return liberadasHojeRoomIds.has(room.id);
    return etapaDaSala(room) === filtro;
  });
  const temFiltro = filtro !== 'todos' || search.trim().length > 0;
  const limparFiltros = () => { setFiltro('todos'); setSearch(''); };

  const invoke = async (body: Record<string, unknown>) => {
    const { data: result, error } = await supabase.functions.invoke('higiene-salas', { body });
    if (error) throw error;
    if (result?.error) throw new Error(result.error);
    return result;
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['room-hygiene', profile?.clinica_id] });
  const mutation = useMutation({ mutationFn: invoke, onSuccess: () => void refresh(), onError: (error) => toast.error(error.message || 'Operação não concluída') });
  const createChecklist = useMutation({
    mutationFn: () => {
      const items = itemText.split('\n').map((label, index) => ({ id: `item_${index + 1}`, label: label.trim(), required: true })).filter((item) => item.label);
      return invoke({ action: 'configure', title, items });
    },
    onSuccess: () => { toast.success('Nova versão do checklist ativada'); setConfigAberta(false); void refresh(); },
    onError: (error) => toast.error(error.message || 'Não foi possível salvar o checklist'),
  });

  const proximaInspecao = data.canReview ? pendingReview[0] ?? null : null;
  const proximaInspecaoSala = proximaInspecao ? data.rooms.find((item) => item.id === proximaInspecao.room_id) : null;
  const descricao = data.rooms.length > 0
    ? `${plural(data.rooms.length, 'sala', 'salas')} · ${stats.aguardando} aguardando limpeza · ${stats.inspecao} aguardando inspeção · ${stats.liberadas} ${stats.liberadas === 1 ? 'liberada' : 'liberadas'} hoje · atualiza a cada 30 s`
    : 'Checklists, inspeções e liberação segura de ambientes';

  if (query.isLoading) return <main className="space-y-5"><PageHeader title="Higienização de salas" description="Checklists, inspeções e liberação segura de ambientes" icon={<SprayCan />} /><div className="grid grid-cols-2 gap-2 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Card key={i} className="h-24 animate-pulse rounded-2xl border-border/60" />)}</div><div className="grid gap-3 lg:grid-cols-2"><Card className="h-36 animate-pulse rounded-2xl border-border/60" /><Card className="h-36 animate-pulse rounded-2xl border-border/60" /></div></main>;
  if (query.error) return <ErrorState title="Não foi possível carregar a higienização" description="A operação foi pausada para evitar liberar uma sala com estado desatualizado." error={query.error} onRetry={() => void query.refetch()} />;

  const indicadores: Array<{ key: Etapa; icon: typeof SprayCan; label: string; caption: string; color: string; surface: string; escuro: boolean }> = [
    { key: 'aguardando', icon: SprayCan, label: 'Aguardando limpeza', caption: 'marcadas como limpeza em Salas e leitos', color: 'text-white', surface: 'bg-white/15', escuro: true },
    { key: 'executando', icon: Timer, label: 'Em execução', caption: 'checklist em andamento', color: 'text-[#1080CA]', surface: 'bg-[#1080CA]/10', escuro: false },
    { key: 'inspecao', icon: Clock3, label: 'Aguardando inspeção', caption: 'bloqueadas até revisão', color: 'text-warning', surface: 'bg-warning/10', escuro: false },
    { key: 'liberadas', icon: CheckCircle2, label: 'Liberadas hoje', caption: 'aprovadas na inspeção', color: 'text-success', surface: 'bg-success/10', escuro: false },
  ];

  return <main className="space-y-6">
    <PageHeader
      title="Higienização de salas"
      description={descricao}
      icon={<SprayCan />}
      actions={<>
        <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
          <Link to="/gestao-fluxo"><DoorOpen aria-hidden="true" className="h-4 w-4" /> Salas e leitos</Link>
        </Button>
        <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={() => void refresh()} aria-label="Atualizar higienização" title="Atualizar higienização">
          <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} />
        </Button>
        {data.canConfigure && <Button className="shrink-0 gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" onClick={() => setConfigAberta((current) => !current)} aria-expanded={configAberta} aria-controls="hygiene-config">
          <Plus className="h-4 w-4" /> {activeChecklist ? 'Nova versão do checklist' : 'Configurar checklist'}
        </Button>}
      </>}
    />

    <section role="group" aria-label="Situação da higienização" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Situação agora</h2>
        <p className="text-xs text-muted-foreground">{filtro === 'todos' ? 'Clique em um indicador para filtrar as salas.' : `Mostrando apenas ${FILTRO_LABEL[filtro]}.`}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {indicadores.map((s) => {
          const Icon = s.icon;
          const ativo = filtro === s.key;
          return <button key={s.key} type="button" aria-pressed={ativo} onClick={() => setFiltro(ativo ? 'todos' : s.key)}
            className={cn(
              'group rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
              s.escuro && 'border-transparent bg-gradient-primary text-white',
              ativo && !s.escuro && 'border-[#1080CA]/50 ring-1 ring-[#1080CA]/30',
              ativo && s.escuro && 'ring-2 ring-[#1080CA]/60',
            )}>
            <div className="flex min-h-[96px] items-center gap-3 p-3">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.surface)}><Icon aria-hidden="true" className={cn('h-5 w-5', s.color)} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className={cn('truncate text-xs font-semibold', s.escuro ? 'text-white/80' : 'text-foreground')}>{s.label}</h3>
                  <span className={cn('text-2xl font-bold tabular-nums', s.color)}>{stats[s.key]}</span>
                </div>
                <p className={cn('truncate text-[11px]', s.escuro ? 'text-white/60' : 'text-muted-foreground')}>{s.caption}</p>
              </div>
            </div>
          </button>;
        })}
      </div>
      {stats.aguardando > 0 && <p className="text-xs text-muted-foreground">
        {plural(stats.aguardando, 'sala marcada', 'salas marcadas')} como limpeza em <Link to="/gestao-fluxo" className="font-medium text-[#1080CA] underline-offset-2 hover:underline">Salas e leitos</Link> ainda sem checklist iniciado.
      </p>}
    </section>

    {proximaInspecao && <Card className="overflow-hidden rounded-2xl border-[#1080CA]/30 shadow-[0_8px_24px_rgba(16,128,202,0.12)]">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><ShieldCheck className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1080CA]">Próxima inspeção</p>
            <h2 className="truncate text-lg font-bold text-foreground">{proximaInspecaoSala?.nome || 'Sala'}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Enviada {fmt(proximaInspecao.submitted_at!)} · {plural(pendingReview.length, 'sala aguarda', 'salas aguardam')} liberação</p>
          </div>
        </div>
        <Button asChild className="h-10 gap-1.5 rounded-full bg-gradient-primary text-white hover:brightness-110"><a href="#review-heading">Ir para inspeção</a></Button>
      </CardContent>
    </Card>}

    {data.canConfigure && <Card id="hygiene-config" className="rounded-2xl border-border/60 shadow-xs">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm"><ClipboardCheck className="h-4 w-4" /></span>
            <h2 className="text-base font-semibold text-foreground">Checklist vigente</h2>
            {activeChecklist && <Badge variant="outline" className="h-5 rounded-full border-[#BFD8EE] bg-white text-xs tabular-nums text-[#1080CA]">v{activeChecklist.version}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{activeChecklist ? `${activeChecklist.title} · ${plural(activeChecklist.items.length, 'item obrigatório', 'itens obrigatórios')}. Alterar os itens cria uma nova versão; execuções anteriores preservam o checklist usado.` : 'Configure a primeira versão antes de iniciar uma higienização.'}</p>
        </div>
        {activeChecklist && <ul className="grid gap-2 sm:grid-cols-2">{activeChecklist.items.map((item) => <li key={item.id} className="flex items-center gap-2 text-sm"><CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-[#1080CA]" />{item.label}{item.required && <Badge variant="outline" className="ml-1 rounded-full text-[10px]">Obrigatório</Badge>}</li>)}</ul>}
        {(configAberta || !activeChecklist) && <form className="grid gap-3 rounded-xl border border-[#DCE6F2] bg-[#F3F8FC] p-3 md:grid-cols-[1fr_2fr_auto]" onSubmit={(event) => { event.preventDefault(); createChecklist.mutate(); }}>
          <div className="space-y-2"><Label htmlFor="hygiene-title">Nome do checklist</Label><Input id="hygiene-title" className="rounded-full focus-visible:ring-[#1080CA]" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} /></div>
          <div className="space-y-2"><Label htmlFor="hygiene-items">Um item obrigatório por linha</Label><Textarea id="hygiene-items" className="rounded-xl focus-visible:ring-[#1080CA]" value={itemText} onChange={(event) => setItemText(event.target.value)} rows={4} maxLength={5000} /></div>
          <div className="flex items-end gap-2">
            {activeChecklist && <Button type="button" variant="outline" className="h-9 rounded-full text-xs" onClick={() => setConfigAberta(false)}>Cancelar</Button>}
            <Button type="submit" className="h-9 rounded-full bg-gradient-primary text-xs text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110" disabled={createChecklist.isPending || !title.trim() || !itemText.trim()}>{createChecklist.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Versionar</Button>
          </div>
        </form>}
      </CardContent>
    </Card>}

    <section className="space-y-3" aria-labelledby="rooms-heading">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm"><DoorOpen className="h-4 w-4" /></span>
          <h2 id="rooms-heading" className="text-base font-semibold text-foreground">Salas</h2>
          <Badge variant="outline" className="h-5 rounded-full border-[#BFD8EE] bg-white text-xs tabular-nums text-[#1080CA]">{data.rooms.length}</Badge>
        </div>
        <div className="relative w-full sm:ml-2 sm:w-72">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar sala por nome ou local" className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]" placeholder="Buscar sala..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {temFiltro && <Button variant="ghost" size="sm" className="h-10 gap-1.5 rounded-full text-muted-foreground" onClick={limparFiltros}><X aria-hidden="true" className="h-3.5 w-3.5" /> Limpar filtros</Button>}
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">{salasFiltradas.length} de {plural(data.rooms.length, 'sala', 'salas')}</p>
      </div>

      {salasFiltradas.length === 0 ? <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardContent className="py-16 text-center text-muted-foreground">
          <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><SprayCan className="h-7 w-7" /></span>
          <p className="font-medium text-foreground">{data.rooms.length === 0 ? 'Nenhuma sala cadastrada nesta unidade.' : 'Nenhuma sala corresponde aos filtros'}</p>
          <p className="mt-1 text-sm">{data.rooms.length === 0 ? 'Cadastre salas e leitos para iniciar o controle de higienização.' : 'Limpe a busca ou o indicador selecionado para ver todas as salas.'}</p>
          {data.rooms.length === 0
            ? <Button asChild className="mt-4 rounded-full bg-gradient-primary text-white hover:brightness-110" size="sm"><Link to="/gestao-fluxo">Ir para Salas e leitos</Link></Button>
            : <Button className="mt-4 rounded-full" size="sm" variant="outline" onClick={limparFiltros}>Limpar filtros</Button>}
        </CardContent>
      </Card> : <div className="grid gap-3 lg:grid-cols-2">{salasFiltradas.map((room) => {
        const open = openByRoom.get(room.id);
        const pending = pendingByRoom.get(room.id);
        const checklist = open ? data.checklists.find((item) => item.id === open.checklist_version_id) : activeChecklist;
        const etapa = etapaDaSala(room);
        const marcados = completed[open?.id ?? ''] ?? {};
        const progresso = (() => {
          if (open && checklist) { const req = checklist.items.filter((item) => item.required); return { done: req.filter((item) => marcados[item.id]).length, total: req.length }; }
          if (pending) { const req = (pending.completed_items || []).filter((item) => item.required); return { done: req.filter((item) => item.completed).length, total: req.length }; }
          return null;
        })();
        const pct = progresso && progresso.total > 0 ? Math.round((progresso.done / progresso.total) * 100) : 0;
        const podeIniciar = Boolean(activeChecklist) && room.status !== 'ocupado' && room.status !== 'manutencao' && !pendingReviewRoomIds.has(room.id) && !mutation.isPending;
        return <Card key={room.id} className={cn('overflow-hidden rounded-2xl border-border/60 shadow-xs transition-all duration-200', etapa === 'aguardando' && 'border-info/40 ring-1 ring-info/20', etapa === 'inspecao' && 'border-warning/40 ring-1 ring-warning/20', etapa === 'executando' && 'border-[#1080CA]/40 ring-1 ring-[#1080CA]/20')}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-foreground">{room.nome}</h3>
                <p className="text-xs text-muted-foreground">{room.localizacao || 'Local não informado'}</p>
              </div>
              <Badge variant="outline" className={cn('shrink-0 rounded-full', STATUS_BADGE[room.status] ?? '')}>{STATUS_LABEL[room.status] ?? 'Indisponível'}</Badge>
            </div>
            {etapa === 'aguardando' && <p className="text-xs text-muted-foreground">Marcada para limpeza em <Link to="/gestao-fluxo" className="font-medium text-[#1080CA] underline-offset-2 hover:underline">Salas e leitos</Link>. Inicie o checklist para registrar a higienização.</p>}
            {progresso && progresso.total > 0 && <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>Itens obrigatórios</span><span className="tabular-nums">{progresso.done} de {progresso.total}</span></div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Checklist de ${room.nome}`} aria-valuemin={0} aria-valuemax={progresso.total} aria-valuenow={progresso.done}>
                <div className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-gradient-primary' : 'bg-[#1080CA]')} style={{ width: `${pct}%` }} />
              </div>
            </div>}
            {!open && <Button size="sm" className="h-9 rounded-full bg-gradient-primary text-xs text-white hover:brightness-110 disabled:opacity-50" disabled={!podeIniciar} onClick={() => mutation.mutate({ action: 'start', room_id: room.id })}><SprayCan className="mr-2 h-4 w-4" />Iniciar higienização</Button>}
            {!open && !activeChecklist && !pendingReviewRoomIds.has(room.id) && <p className="text-xs text-muted-foreground">Configure o checklist vigente para liberar o início.</p>}
            {pendingReviewRoomIds.has(room.id) && <p className="text-sm font-medium text-warning">Higienização enviada; sala bloqueada até revisão.</p>}
            {open && checklist && <div className="space-y-3 rounded-xl border border-[#DCE6F2] bg-[#F3F8FC] p-3">
              <p className="text-sm font-medium">Checklist v{checklist.version} · iniciado {fmt(open.started_at)}</p>
              {checklist.items.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-2 text-sm"><Checkbox checked={marcados[item.id] ?? false} disabled={Boolean(open.submitted_at)} onCheckedChange={(checked) => setCompleted((current) => ({ ...current, [open.id]: { ...(current[open.id] ?? {}), [item.id]: checked === true } }))} /><span>{item.label}{item.required && <span className="text-destructive"> *</span>}</span></label>)}
              <div className="space-y-1"><Label htmlFor={`notes-${open.id}`}>Observação da execução</Label><Textarea id={`notes-${open.id}`} className="rounded-xl bg-white focus-visible:ring-[#1080CA]" maxLength={1000} rows={2} value={executionNotes[open.id] ?? ''} disabled={Boolean(open.submitted_at)} onChange={(event) => setExecutionNotes((current) => ({ ...current, [open.id]: event.target.value }))} /></div>
              {!open.submitted_at && <Button size="sm" className="h-9 rounded-full bg-gradient-primary text-xs text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110" disabled={mutation.isPending || checklist.items.some((item) => item.required && !(marcados[item.id] ?? false))} onClick={() => mutation.mutate({ action: 'submit', execution_id: open.id, completed_items: checklist.items.map((item) => ({ ...item, completed: marcados[item.id] ?? false })), notes: executionNotes[open.id] ?? '' })}>Enviar para revisão</Button>}
              {open.submitted_at && <p className="text-sm text-muted-foreground">Enviado para revisão em {fmt(open.submitted_at)}. A sala permanece bloqueada.</p>}
            </div>}
          </CardContent>
        </Card>;
      })}</div>}
    </section>

    {data.canReview && pendingReview.length > 0 && <section className="space-y-3 scroll-mt-4" aria-labelledby="review-heading">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm"><ShieldCheck className="h-4 w-4" /></span>
        <h2 id="review-heading" className="text-base font-semibold text-foreground">Inspeção e liberação</h2>
        <Badge variant="outline" className="h-5 rounded-full border-[#BFD8EE] bg-white text-xs tabular-nums text-[#1080CA]">{pendingReview.length}</Badge>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">{pendingReview.map((execution, index) => {
        const room = data.rooms.find((item) => item.id === execution.room_id);
        const checklist = data.checklists.find((item) => item.id === execution.checklist_version_id);
        const notaOk = (reviewNotes[execution.id] || '').trim().length >= 3;
        return <Card key={execution.id} className="rounded-2xl border-border/60 shadow-xs">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums', index === 0 ? 'bg-gradient-primary text-white' : 'bg-muted text-foreground')}>{index + 1}</span>
              <div className="min-w-0">
                <h3 className="font-semibold text-foreground">{room?.nome || 'Sala'} · revisão</h3>
                <p className="text-xs text-muted-foreground">Enviado {fmt(execution.submitted_at!)} · checklist v{checklist?.version ?? '?'}</p>
              </div>
            </div>
            <ul className="space-y-1 text-sm">{(execution.completed_items || []).map((item) => <li key={item.id} className="flex items-center gap-2">{item.completed ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" /> : <span aria-hidden="true" className="h-4 w-4 rounded-full border" />}{item.label}</li>)}</ul>
            {execution.notes && <p className="rounded-xl bg-[#F3F8FC] p-2 text-sm">{execution.notes}</p>}
            <div className="space-y-1"><Label htmlFor={`review-${execution.id}`}>Observação da inspeção *</Label><Textarea id={`review-${execution.id}`} className="rounded-xl focus-visible:ring-[#1080CA]" minLength={3} maxLength={1000} rows={2} value={reviewNotes[execution.id] || ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [execution.id]: event.target.value }))} /></div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-9 rounded-full bg-gradient-primary text-xs text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110" disabled={mutation.isPending || !notaOk} onClick={() => mutation.mutate({ action: 'review', execution_id: execution.id, decision: 'approved', note: reviewNotes[execution.id] })}><ShieldCheck className="mr-2 h-4 w-4" />Aprovar e liberar sala</Button>
              <Button size="sm" variant="ghost" className="h-9 rounded-full text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={mutation.isPending || !notaOk} onClick={() => mutation.mutate({ action: 'review', execution_id: execution.id, decision: 'rejected', note: reviewNotes[execution.id] })}>Reprovar e manter bloqueada</Button>
            </div>
          </CardContent>
        </Card>;
      })}</div>
    </section>}

    <section className="space-y-3" aria-labelledby="history-heading">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm"><Clock3 className="h-4 w-4" /></span>
        <h2 id="history-heading" className="text-base font-semibold text-foreground">Histórico recente</h2>
        <Badge variant="outline" className="h-5 rounded-full border-[#BFD8EE] bg-white text-xs tabular-nums text-[#1080CA]">{Math.min(data.executions.length, 15)}</Badge>
      </div>
      {data.executions.length === 0
        ? <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="p-6 text-sm text-muted-foreground">As execuções e inspeções aparecerão aqui. Nenhuma alteração foi feita nas salas.</CardContent></Card>
        : <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="divide-y divide-border/60 p-0">{data.executions.slice(0, 15).map((execution) => {
          const room = data.rooms.find((item) => item.id === execution.room_id);
          const review = reviewByExecution.get(execution.id);
          const badge = review?.decision === 'approved'
            ? { label: 'Aprovada · sala liberada', className: 'border-success/30 bg-success/10 text-success' }
            : review?.decision === 'rejected'
              ? { label: 'Reprovada · segue bloqueada', className: 'border-destructive/30 bg-destructive/10 text-destructive' }
              : execution.submitted_at
                ? { label: 'Aguardando inspeção', className: 'border-warning/30 bg-warning/10 text-warning' }
                : { label: 'Em execução', className: 'border-[#1080CA]/30 bg-[#1080CA]/10 text-[#1080CA]' };
          return <div key={execution.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span><strong>{room?.nome || 'Sala'}</strong> · {fmt(execution.started_at)}{review && <span className="text-muted-foreground"> · inspeção {fmt(review.created_at)}</span>}</span>
            <Badge variant="outline" className={cn('rounded-full', badge.className)}>{badge.label}</Badge>
          </div>;
        })}</CardContent></Card>}
    </section>
  </main>;
}
