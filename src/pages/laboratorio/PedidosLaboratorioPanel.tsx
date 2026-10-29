import { useMemo, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, ClipboardList, Clock3, FilePlus2, History, Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { normalizarExamesSolicitados } from '@/lib/laboratorio/pedidos';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Pedido = {
  id: string;
  codigo: string;
  status: string;
  prioridade: 'rotina' | 'urgente' | 'stat';
  solicitado_em: string;
  indicacao_clinica: string | null;
  pacientes?: { nome?: string } | null;
  medicos?: { nome?: string; crm?: string | null } | null;
  convenios?: { nome?: string } | null;
  exames?: Array<{ id: string; tipo_exame: string; status: string }>;
};

type PedidoEvento = {
  id: string;
  tipo: string;
  status_anterior: string | null;
  status_novo: string | null;
  created_at: string;
  detalhes: Record<string, unknown>;
};
type ExameInput = { catalogId: string; nome: string };
type ExameCatalogo = { id: string; nome: string; codigo_tuss: string | null; categoria: string };

const db = supabase as any;
const PEDIDOS_VAZIOS: Pedido[] = [];
const statusLabel: Record<string, string> = {
  solicitado: 'Solicitado',
  agendado: 'Agendado',
  em_processamento: 'Em processamento',
  parcialmente_liberado: 'Parcialmente liberado',
  liberado: 'Liberado',
  cancelado: 'Cancelado',
};
const priorityLabel: Record<string, string> = { rotina: 'Rotina', urgente: 'Urgente', stat: 'STAT' };

function dataHora(valor: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor));
}

type PedidoTask = 'new' | 'history';
export function PedidosLaboratorioPanel({ task }: { task?: PedidoTask }) {
  const location = useLocation();
  const { profile } = useSupabaseAuth();
  return <PedidosWorkspace key={`${location.pathname}:${profile?.clinica_id ?? ''}`} task={task} />;
}
export default PedidosLaboratorioPanel;

function PedidosWorkspace({ task }: { task?: PedidoTask }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { pedidoId } = useParams();
  const completed = useRef(false);
  const saveLock = useRef(false);
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const criandoPedido = task === 'new';
  const [termo, setTermo] = useState(location.state?.pedidoSearch ?? '');
  const pedidoSelecionado = task === 'history' ? pedidoId : null;
  const listState = { pedidoSearch: termo };
  const back = () => navigate('/laboratorio?aba=pedidos', { state: listState });
  const openNew = () => navigate('/laboratorio/pedidos/novo', { state: listState });
  const openHistory = (id: string) => navigate(`/laboratorio/pedidos/${id}/historico`, { state: listState });
  const [pacienteId, setPacienteId] = useState('');
  const [medicoId, setMedicoId] = useState('');
  const [convenioId, setConvenioId] = useState('');
  const [prioridade, setPrioridade] = useState<'rotina' | 'urgente' | 'stat'>('rotina');
  const [indicacao, setIndicacao] = useState('');
  const [exames, setExames] = useState<ExameInput[]>([{ catalogId: '', nome: '' }]);

  const pedidosQuery = useQuery({
    queryKey: ['lab-pedidos', profile?.clinica_id, task, pedidoId],
    enabled: !!profile?.clinica_id && task !== 'new',
    queryFn: async () => {
      let query = db.from('pedidos_laboratorio')
        .select('id, codigo, status, prioridade, solicitado_em, indicacao_clinica, pacientes(nome), medicos(nome, crm), convenios(nome), exames(id, tipo_exame, status)')
        .eq('clinica_id', profile!.clinica_id)
        .order('solicitado_em', { ascending: false })
        .limit(task === 'history' ? 1 : 250);
      if (task === 'history') query = query.eq('id', pedidoId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Pedido[];
    },
  });

  const medicosQuery = useQuery({
    queryKey: ['lab-pedidos-medicos', profile?.clinica_id],
    enabled: !!profile?.clinica_id && criandoPedido,
    queryFn: async () => {
      const { data, error } = await supabase.from('medicos').select('id, nome, crm')
        .eq('clinica_id', profile!.clinica_id!).order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
  const conveniosQuery = useQuery({
    queryKey: ['lab-pedidos-convenios', profile?.clinica_id],
    enabled: !!profile?.clinica_id && criandoPedido,
    queryFn: async () => {
      const { data, error } = await supabase.from('convenios').select('id, nome')
        .eq('clinica_id', profile!.clinica_id!).eq('ativo', true).order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
  const catalogoQuery = useQuery({
    queryKey: ['lab-catalogo-exames', profile?.clinica_id],
    enabled: !!profile?.clinica_id && criandoPedido,
    queryFn: async () => {
      const { data, error } = await db.from('tipo_exames_catalog')
        .select('id, nome, codigo_tuss, categoria')
        .eq('clinica_id', profile!.clinica_id).eq('ativo', true).order('nome').limit(500);
      if (error) throw error;
      return (data ?? []) as ExameCatalogo[];
    },
  });
  const eventosQuery = useQuery({
    queryKey: ['lab-pedido-eventos', profile?.clinica_id, pedidoSelecionado],
    enabled: !!profile?.clinica_id && !!pedidoSelecionado && !!pedidosQuery.data?.length,
    queryFn: async () => {
      const { data, error } = await db.from('pedido_laboratorio_eventos')
        .select('id, tipo, status_anterior, status_novo, created_at, detalhes')
        .eq('clinica_id', profile!.clinica_id).eq('pedido_id', pedidoSelecionado)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PedidoEvento[];
    },
  });

  const criarPedido = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Atualize a sessão.');
      if (medicosQuery.isError || conveniosQuery.isError) throw new Error('Atualize os dados de solicitante e convênio antes de registrar.');
      if (!pacienteId) throw new Error('Selecione o paciente.');
      normalizarExamesSolicitados(exames.map((exame) => exame.nome));
      const examesValidos = exames.map((exame) => ({
        catalog_id: exame.catalogId || null,
        nome: exame.nome.trim(),
      })).filter((exame) => exame.nome);
      const { data, error } = await db.rpc('criar_pedido_laboratorio', {
        p_paciente_id: pacienteId,
        p_medico_solicitante_id: medicoId || null,
        p_convenio_id: convenioId || null,
        p_prioridade: prioridade,
        p_indicacao_clinica: indicacao.trim() || null,
        p_exames: examesValidos,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lab-pedidos', profile?.clinica_id] }),
        queryClient.invalidateQueries({ queryKey: ['exames-pendentes-lab', profile?.clinica_id] }),
      ]);
      toast.success('Pedido laboratorial registrado');
      completed.current = true;
      back();
    },
    onError: (error) => toast.error('Não foi possível criar o pedido', { description: error.message }),
    onSettled: () => { saveLock.current = false; },
  });

  const pedidos = pedidosQuery.data ?? PEDIDOS_VAZIOS;
  const filtrados = useMemo(() => {
    const busca = termo.trim().toLocaleLowerCase('pt-BR');
    if (!busca) return pedidos;
    return pedidos.filter((pedido) => [pedido.codigo, pedido.pacientes?.nome, pedido.medicos?.nome, ...(pedido.exames ?? []).map((exame) => exame.tipo_exame)]
      .some((valor) => valor?.toLocaleLowerCase('pt-BR').includes(busca)));
  }, [pedidos, termo]);
  const emAberto = pedidos.filter((pedido) => !['liberado', 'cancelado'].includes(pedido.status)).length;
  const urgentes = pedidos.filter((pedido) => ['urgente', 'stat'].includes(pedido.prioridade) && !['liberado', 'cancelado'].includes(pedido.status)).length;
  const liberados = pedidos.filter((pedido) => pedido.status === 'liberado').length;
  const temExameValido = exames.some((exame) => exame.nome.trim().length > 0);

  const dirty = Boolean(pacienteId || medicoId || convenioId || prioridade !== 'rotina' || indicacao || exames.some(exame => exame.nome || exame.catalogId) || exames.length > 1);
  if (task) return <div className="space-y-5 pb-24 lg:pb-8">
    <UnsavedChangesGuard dirty={task === 'new' && dirty} busy={criarPedido.isPending} completed={completed} />
    <Button asChild variant="outline"><Link to="/laboratorio?aba=pedidos" state={listState}>Voltar aos pedidos</Link></Button>
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={task === 'new' ? 'Novo pedido laboratorial' : 'Histórico do pedido'} icon={<ClipboardList />} description={task === 'new' ? 'Identifique o paciente e reúna os exames solicitados. Confira os dados antes de registrar.' : 'Acompanhe os eventos e os exames vinculados a esta solicitação.'} />
      {task === 'new' ? <>
        {medicosQuery.isError && <ErrorState title="Não foi possível carregar os solicitantes" error={medicosQuery.error} onRetry={() => void medicosQuery.refetch()} />}
        {conveniosQuery.isError && <ErrorState title="Não foi possível carregar os convênios" error={conveniosQuery.error} onRetry={() => void conveniosQuery.refetch()} />}
          <form id="novo-pedido-lab" className="rounded-xl border bg-card p-4 sm:p-6" onSubmit={(event) => { event.preventDefault(); if (saveLock.current) return; saveLock.current = true; criarPedido.mutate(); }}>
            <fieldset className="min-w-0 space-y-5" disabled={criarPedido.isPending || medicosQuery.isError || conveniosQuery.isError}><legend className="sr-only">Paciente e exames solicitados</legend>
            <div className="space-y-2"><Label htmlFor="pedido-lab-paciente">Paciente *</Label><PacienteCombobox id="pedido-lab-paciente" value={pacienteId} onChange={(id) => setPacienteId(id)} disabled={criarPedido.isPending} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Médico solicitante</Label><Select value={medicoId} onValueChange={setMedicoId} disabled={medicosQuery.isLoading || criarPedido.isPending}><SelectTrigger aria-label="Médico solicitante"><SelectValue placeholder="Selecione o médico" /></SelectTrigger><SelectContent>{(medicosQuery.data ?? []).map((medico) => <SelectItem key={medico.id} value={medico.id}>{medico.nome}{medico.crm ? ` · ${medico.crm}` : ''}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Convênio</Label><Select value={convenioId} onValueChange={setConvenioId} disabled={conveniosQuery.isLoading || criarPedido.isPending}><SelectTrigger aria-label="Convênio"><SelectValue placeholder="Particular / selecione" /></SelectTrigger><SelectContent>{(conveniosQuery.data ?? []).map((convenio) => <SelectItem key={convenio.id} value={convenio.id}>{convenio.nome}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <div className="space-y-2"><Label>Prioridade *</Label><Select value={prioridade} onValueChange={(value: 'rotina' | 'urgente' | 'stat') => setPrioridade(value)}><SelectTrigger aria-label="Prioridade"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="rotina">Rotina</SelectItem><SelectItem value="urgente">Urgente</SelectItem><SelectItem value="stat">STAT — imediato</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="pedido-lab-indicacao">Indicação clínica</Label><Input id="pedido-lab-indicacao" value={indicacao} onChange={(event) => setIndicacao(event.target.value)} maxLength={500} placeholder="Motivo clínico ou informação relevante" /></div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>Exames solicitados *</Label><Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setExames((lista) => [...lista, { catalogId: '', nome: '' }])} disabled={exames.length >= 40 || criarPedido.isPending}><Plus className="h-3.5 w-3.5" /> Adicionar exame</Button></div>
              {catalogoQuery.isError && <ErrorState compact description="Não foi possível carregar o catálogo; você ainda pode informar o nome manualmente." error={catalogoQuery.error} onRetry={() => void catalogoQuery.refetch()} />}
              <div className="space-y-2">{exames.map((exame, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Select value={exame.catalogId || '__manual__'} onValueChange={(value) => {
                  const itemCatalogo = (catalogoQuery.data ?? []).find((item) => item.id === value);
                  setExames((lista) => lista.map((item, itemIndex) => itemIndex === index ? { catalogId: itemCatalogo?.id ?? '', nome: itemCatalogo?.nome ?? '' } : item));
                }} disabled={criarPedido.isPending || catalogoQuery.isLoading}>
                  <SelectTrigger aria-label={`Origem do exame ${index + 1}`}><SelectValue placeholder="Escolher no catálogo" /></SelectTrigger>
                  <SelectContent><SelectItem value="__manual__">Informar exame manualmente</SelectItem>{(catalogoQuery.data ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}{item.codigo_tuss ? ` · ${item.codigo_tuss}` : ''}</SelectItem>)}</SelectContent>
                </Select>
                {exame.catalogId ? <div className="flex min-h-10 items-center rounded-md border bg-muted/20 px-3 text-sm"><span className="truncate">{exame.nome}</span></div> : <Input value={exame.nome} maxLength={160} onChange={(event) => setExames((lista) => lista.map((item, itemIndex) => itemIndex === index ? { ...item, nome: event.target.value } : item))} placeholder={`Nome do exame ${index + 1}`} aria-label={`Nome do exame ${index + 1}`} />}
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover exame ${index + 1}`} disabled={exames.length === 1 || criarPedido.isPending} onClick={() => setExames((lista) => lista.filter((_, itemIndex) => itemIndex !== index))}>×</Button>
              </div>)}</div>
              <p className="text-xs text-muted-foreground" role={!temExameValido ? 'status' : undefined}>{!temExameValido ? 'Informe pelo menos um exame para habilitar o registro.' : 'Os exames serão vinculados ao cadastro clínico existente e poderão ser processados pela worklist.'}</p>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/[0.04] p-3 text-xs text-muted-foreground"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>O status do pedido acompanha os status dos exames vinculados; alterações são registradas no histórico.</p></div>
          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t pt-4 scroll-mb-24"><span role="status" className="mr-auto w-full text-xs text-muted-foreground sm:w-auto">{criarPedido.isPending ? 'Registrando pedido…' : dirty ? 'Alterações não salvas' : 'Sem alterações'}</span><Button type="button" variant="outline" onClick={back} disabled={criarPedido.isPending}>Cancelar</Button><Button type="submit" form="novo-pedido-lab" disabled={criarPedido.isPending || !pacienteId || !temExameValido} className="gap-2">{criarPedido.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Registrar pedido</Button></div>
            </fieldset>
          </form>
      </> : pedidosQuery.isError ? <ErrorState title="Não foi possível carregar o pedido" error={pedidosQuery.error} onRetry={() => void pedidosQuery.refetch()} /> : pedidosQuery.isLoading ? <p role="status">Carregando pedido…</p> : !pedidos[0] ? <p role="status">Pedido não encontrado nesta clínica.</p> : <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
        <div className="space-y-2 border-b pb-4">
          <p className="text-xs font-mono text-primary">{pedidos[0].codigo}</p>
          <h2 className="text-lg font-semibold">{pedidos[0].pacientes?.nome ?? 'Paciente sem nome'}</h2>
          <p className="text-sm">{pedidos[0].exames?.map(exame => exame.tipo_exame).join(', ') || 'Sem exames vinculados'}</p>
          <div className="flex flex-wrap gap-2"><Badge variant="outline">{statusLabel[pedidos[0].status] ?? pedidos[0].status}</Badge><Badge variant="secondary">{priorityLabel[pedidos[0].prioridade]}</Badge></div>
        </div>
          {eventosQuery.isError ? <ErrorState title="Não foi possível carregar o histórico" error={eventosQuery.error} onRetry={() => void eventosQuery.refetch()} /> : eventosQuery.isLoading ? <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…</div> : (eventosQuery.data?.length ?? 0) === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum evento registrado.</p> : <ol className="space-y-4 py-2">{eventosQuery.data?.map((evento) => <li key={evento.id} className="relative flex gap-3"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-4 ring-primary/10" /><div className="min-w-0"><p className="text-sm font-medium">{evento.tipo === 'pedido_criado' ? 'Pedido criado' : `Status: ${statusLabel[evento.status_anterior ?? ''] ?? evento.status_anterior ?? '—'} → ${statusLabel[evento.status_novo ?? ''] ?? evento.status_novo ?? '—'}`}</p><p className="mt-1 text-xs text-muted-foreground">{dataHora(evento.created_at)}</p></div></li>)}</ol>}

      </section>}
    </div>
  </div>;

  return (
    <section className="space-y-5" aria-labelledby="lab-pedidos-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Atendimento laboratorial</p>
          <h2 id="lab-pedidos-heading" className="mt-1 text-2xl font-semibold tracking-tight">Pedidos de exames</h2>
          <p className="mt-1 text-sm text-muted-foreground">Agrupe exames por paciente e acompanhe o pedido até a liberação.</p>
        </div>
        <Button onClick={openNew} className="gap-2 self-start sm:self-auto">
          <FilePlus2 className="h-4 w-4" /> Novo pedido
        </Button>
      </div>

      <section aria-label="Resumo dos pedidos" className="overflow-hidden rounded-xl border border-border/70 bg-card">
        <dl className="grid grid-cols-3 divide-x divide-border/70">
          <div className="min-w-0 px-3 py-3 sm:px-4">
            <dt className="break-words text-xs leading-tight text-muted-foreground">Em andamento</dt>
            <dd className="mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums"><Activity aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />{pedidosQuery.isLoading ? '—' : emAberto}</dd>
          </div>
          <div className="min-w-0 px-3 py-3 sm:px-4">
            <dt className="break-words text-xs leading-tight text-muted-foreground">Prioridade alta</dt>
            <dd className={cn('mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums', urgentes > 0 ? 'text-warning-foreground' : 'text-muted-foreground')}><AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />{pedidosQuery.isLoading ? '—' : urgentes}</dd>
          </div>
          <div className="min-w-0 px-3 py-3 sm:px-4">
            <dt className="break-words text-xs leading-tight text-muted-foreground">Liberados</dt>
            <dd className={cn('mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums', liberados > 0 ? 'text-success' : 'text-muted-foreground')}><ClipboardList aria-hidden="true" className="h-4 w-4 shrink-0" />{pedidosQuery.isLoading ? '—' : liberados}</dd>
          </div>
        </dl>
      </section>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="gap-3 border-b bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="text-base">Fila de pedidos</CardTitle><CardDescription>Os exames e estados vêm dos registros da clínica.</CardDescription></div>
          <div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar pedidos" className="pl-9" placeholder="Paciente, pedido ou exame" value={termo} onChange={(event) => setTermo(event.target.value)} /></div>
        </CardHeader>
        <CardContent className="p-0">
          {pedidosQuery.isError ? <div className="p-5"><ErrorState title="Não foi possível carregar os pedidos" error={pedidosQuery.error} onRetry={() => void pedidosQuery.refetch()} /></div> : pedidosQuery.isLoading ? (
            <div role="status" className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando pedidos da clínica…</div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center"><span className="rounded-2xl bg-primary/10 p-3 text-primary"><ClipboardList className="h-6 w-6" /></span><h3 className="mt-4 font-semibold">{termo ? 'Nenhum pedido encontrado' : 'Ainda não há pedidos laboratoriais'}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{termo ? 'Tente buscar por outro paciente, código ou exame.' : 'Registre uma solicitação para iniciar o acompanhamento de exames nesta clínica.'}</p>{!termo && <Button onClick={openNew} variant="outline" className="mt-4 gap-2"><Plus className="h-4 w-4" /> Registrar primeiro pedido</Button>}</div>
          ) : (
            <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Pedido / paciente</th><th className="px-4 py-3 font-medium">Exames</th><th className="px-4 py-3 font-medium">Solicitante / convênio</th><th className="px-4 py-3 font-medium">Prioridade</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Recebido</th><th className="px-5 py-3 text-right font-medium">Histórico</th></tr></thead>
                <tbody className="divide-y divide-border/70">
                  {filtrados.map((pedido) => <tr key={pedido.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-5 py-4"><p className="font-mono text-xs text-primary">{pedido.codigo}</p><p className="mt-1 font-medium">{pedido.pacientes?.nome ?? 'Paciente sem nome'}</p></td>
                    <td className="max-w-[240px] px-4 py-4"><p className="line-clamp-2">{pedido.exames?.map((exame) => exame.tipo_exame).join(', ') || 'Sem exames vinculados'}</p><p className="mt-1 text-xs text-muted-foreground">{pedido.exames?.length ?? 0} exame(s)</p></td>
                    <td className="px-4 py-4"><p>{pedido.medicos?.nome ?? 'Solicitante não informado'}</p><p className="mt-1 text-xs text-muted-foreground">{pedido.convenios?.nome ?? 'Particular'}</p></td>
                    <td className="px-4 py-4"><Badge variant={pedido.prioridade === 'stat' ? 'destructive' : 'secondary'} className={pedido.prioridade === 'urgente' ? 'border-warning/30 bg-warning/10 text-warning-foreground' : ''}>{priorityLabel[pedido.prioridade]}</Badge></td>
                    <td className="px-4 py-4"><Badge variant="outline">{statusLabel[pedido.status] ?? pedido.status}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{dataHora(pedido.solicitado_em)}</td>
                    <td className="px-5 py-4 text-right"><Button variant="ghost" size="sm" className="gap-1.5" aria-label={`Ver histórico do pedido ${pedido.codigo}`} onClick={() => openHistory(pedido.id)}><History className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Ver histórico</span></Button></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border/70 xl:hidden" aria-label="Pedidos laboratoriais">
              {filtrados.map((pedido) => (
                <li key={pedido.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-primary">{pedido.codigo}</p>
                      <p className="mt-1 break-words font-semibold">{pedido.pacientes?.nome ?? 'Paciente sem nome'}</p>
                      <p className="mt-1 break-words text-sm">{pedido.exames?.map((exame) => exame.tipo_exame).join(', ') || 'Sem exames vinculados'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{pedido.exames?.length ?? 0} exame(s)</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={`Ver histórico do pedido ${pedido.codigo}`} onClick={() => openHistory(pedido.id)}>
                      <History aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={pedido.prioridade === 'stat' ? 'destructive' : 'secondary'} className={pedido.prioridade === 'urgente' ? 'border-warning/30 bg-warning/10 text-warning-foreground' : ''}>{priorityLabel[pedido.prioridade]}</Badge>
                    <Badge variant={pedido.status === 'liberado' ? 'success' : pedido.status === 'cancelado' ? 'outline' : 'secondary'}>{statusLabel[pedido.status] ?? pedido.status}</Badge>
                    <span className="text-xs text-muted-foreground">{dataHora(pedido.solicitado_em)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{pedido.medicos?.nome ?? 'Solicitante não informado'} · {pedido.convenios?.nome ?? 'Particular'}</p>
                </li>
              ))}
            </ul>
            </>
          )}
        </CardContent>
      </Card>

    </section>
  );
}
