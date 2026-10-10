import { useMemo, useState } from 'react';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

export function PedidosLaboratorioPanel() {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [modalAberto, setModalAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const [pedidoSelecionado, setPedidoSelecionado] = useState<string | null>(null);
  const [pacienteId, setPacienteId] = useState('');
  const [medicoId, setMedicoId] = useState('');
  const [convenioId, setConvenioId] = useState('');
  const [prioridade, setPrioridade] = useState<'rotina' | 'urgente' | 'stat'>('rotina');
  const [indicacao, setIndicacao] = useState('');
  const [exames, setExames] = useState<ExameInput[]>([{ catalogId: '', nome: '' }]);

  const pedidosQuery = useQuery({
    queryKey: ['lab-pedidos', profile?.clinica_id],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await db.from('pedidos_laboratorio')
        .select('id, codigo, status, prioridade, solicitado_em, indicacao_clinica, pacientes(nome), medicos(nome, crm), convenios(nome), exames(id, tipo_exame, status)')
        .eq('clinica_id', profile!.clinica_id)
        .order('solicitado_em', { ascending: false })
        .limit(250);
      if (error) throw error;
      return (data ?? []) as Pedido[];
    },
  });

  const medicosQuery = useQuery({
    queryKey: ['lab-pedidos-medicos', profile?.clinica_id],
    enabled: !!profile?.clinica_id && modalAberto,
    queryFn: async () => {
      const { data, error } = await supabase.from('medicos').select('id, nome, crm')
        .eq('clinica_id', profile!.clinica_id!).order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
  const conveniosQuery = useQuery({
    queryKey: ['lab-pedidos-convenios', profile?.clinica_id],
    enabled: !!profile?.clinica_id && modalAberto,
    queryFn: async () => {
      const { data, error } = await supabase.from('convenios').select('id, nome')
        .eq('clinica_id', profile!.clinica_id!).eq('ativo', true).order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
  const catalogoQuery = useQuery({
    queryKey: ['lab-catalogo-exames', profile?.clinica_id],
    enabled: !!profile?.clinica_id && modalAberto,
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
    enabled: !!profile?.clinica_id && !!pedidoSelecionado,
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
      limparFormulario();
    },
    onError: (error) => toast.error('Não foi possível criar o pedido', { description: error.message }),
  });

  const limparFormulario = () => {
    setModalAberto(false);
    setPacienteId(''); setMedicoId(''); setConvenioId(''); setPrioridade('rotina'); setIndicacao(''); setExames([{ catalogId: '', nome: '' }]);
  };

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

  return (
    <section className="space-y-5" aria-labelledby="lab-pedidos-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Atendimento laboratorial</p>
          <h2 id="lab-pedidos-heading" className="mt-1 text-2xl font-semibold tracking-tight">Pedidos de exames</h2>
          <p className="mt-1 text-sm text-muted-foreground">Agrupe exames por paciente e acompanhe o pedido até a liberação.</p>
        </div>
        <Button onClick={() => setModalAberto(true)} className="gap-2 self-start sm:self-auto">
          <FilePlus2 className="h-4 w-4" /> Novo pedido
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-border/70 bg-gradient-to-br from-primary/[0.07] to-background"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">Em andamento</p><p className="mt-1 text-2xl font-semibold">{pedidosQuery.isLoading ? '—' : emAberto}</p></div><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Activity className="h-5 w-5" /></span></CardContent></Card>
        <Card className="border-border/70"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">Prioridade alta</p><p className="mt-1 text-2xl font-semibold">{pedidosQuery.isLoading ? '—' : urgentes}</p></div><span className="rounded-xl bg-amber-500/10 p-2.5 text-amber-700"><AlertTriangle className="h-5 w-5" /></span></CardContent></Card>
        <Card className="border-border/70"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">Liberados</p><p className="mt-1 text-2xl font-semibold">{pedidosQuery.isLoading ? '—' : liberados}</p></div><span className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-700"><ClipboardList className="h-5 w-5" /></span></CardContent></Card>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="gap-3 border-b bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="text-base">Fila de pedidos</CardTitle><CardDescription>Os exames e estados vêm dos registros da clínica.</CardDescription></div>
          <div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar pedidos" className="pl-9" placeholder="Paciente, pedido ou exame" value={termo} onChange={(event) => setTermo(event.target.value)} /></div>
        </CardHeader>
        <CardContent className="p-0">
          {pedidosQuery.isError ? <div className="p-5"><ErrorState title="Não foi possível carregar os pedidos" error={pedidosQuery.error} onRetry={() => void pedidosQuery.refetch()} /></div> : pedidosQuery.isLoading ? (
            <div role="status" className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando pedidos da clínica…</div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center"><span className="rounded-2xl bg-primary/10 p-3 text-primary"><ClipboardList className="h-6 w-6" /></span><h3 className="mt-4 font-semibold">{termo ? 'Nenhum pedido encontrado' : 'Ainda não há pedidos laboratoriais'}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{termo ? 'Tente buscar por outro paciente, código ou exame.' : 'Registre uma solicitação para iniciar o acompanhamento de exames nesta clínica.'}</p>{!termo && <Button onClick={() => setModalAberto(true)} variant="outline" className="mt-4 gap-2"><Plus className="h-4 w-4" /> Registrar primeiro pedido</Button>}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Pedido / paciente</th><th className="px-4 py-3 font-medium">Exames</th><th className="px-4 py-3 font-medium">Solicitante / convênio</th><th className="px-4 py-3 font-medium">Prioridade</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Recebido</th><th className="px-5 py-3 text-right font-medium">Histórico</th></tr></thead>
                <tbody className="divide-y divide-border/70">
                  {filtrados.map((pedido) => <tr key={pedido.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-5 py-4"><p className="font-mono text-xs text-primary">{pedido.codigo}</p><p className="mt-1 font-medium">{pedido.pacientes?.nome ?? 'Paciente sem nome'}</p></td>
                    <td className="max-w-[240px] px-4 py-4"><p className="line-clamp-2">{pedido.exames?.map((exame) => exame.tipo_exame).join(', ') || 'Sem exames vinculados'}</p><p className="mt-1 text-xs text-muted-foreground">{pedido.exames?.length ?? 0} exame(s)</p></td>
                    <td className="px-4 py-4"><p>{pedido.medicos?.nome ?? 'Solicitante não informado'}</p><p className="mt-1 text-xs text-muted-foreground">{pedido.convenios?.nome ?? 'Particular'}</p></td>
                    <td className="px-4 py-4"><Badge variant={pedido.prioridade === 'rotina' ? 'secondary' : 'destructive'} className={pedido.prioridade === 'urgente' ? 'bg-amber-500 hover:bg-amber-600' : ''}>{priorityLabel[pedido.prioridade]}</Badge></td>
                    <td className="px-4 py-4"><Badge variant="outline">{statusLabel[pedido.status] ?? pedido.status}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{dataHora(pedido.solicitado_em)}</td>
                    <td className="px-5 py-4 text-right"><Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setPedidoSelecionado(pedido.id)}><History className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Ver histórico</span></Button></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalAberto} onOpenChange={(aberto) => {
        if (criarPedido.isPending) return;
        if (aberto) setModalAberto(true);
        else limparFormulario();
      }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Novo pedido laboratorial</DialogTitle><DialogDescription>Cadastre o paciente e todos os exames solicitados em um único pedido.</DialogDescription></DialogHeader>
          <form id="novo-pedido-lab" className="space-y-5" onSubmit={(event) => { event.preventDefault(); criarPedido.mutate(); }}>
            <div className="space-y-2"><Label>Paciente *</Label><PacienteCombobox value={pacienteId} onChange={(id) => setPacienteId(id)} disabled={criarPedido.isPending} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Médico solicitante</Label><Select value={medicoId} onValueChange={setMedicoId} disabled={medicosQuery.isLoading || criarPedido.isPending}><SelectTrigger><SelectValue placeholder="Selecione o médico" /></SelectTrigger><SelectContent>{(medicosQuery.data ?? []).map((medico) => <SelectItem key={medico.id} value={medico.id}>{medico.nome}{medico.crm ? ` · ${medico.crm}` : ''}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Convênio</Label><Select value={convenioId} onValueChange={setConvenioId} disabled={conveniosQuery.isLoading || criarPedido.isPending}><SelectTrigger><SelectValue placeholder="Particular / selecione" /></SelectTrigger><SelectContent>{(conveniosQuery.data ?? []).map((convenio) => <SelectItem key={convenio.id} value={convenio.id}>{convenio.nome}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <div className="space-y-2"><Label>Prioridade *</Label><Select value={prioridade} onValueChange={(value: 'rotina' | 'urgente' | 'stat') => setPrioridade(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="rotina">Rotina</SelectItem><SelectItem value="urgente">Urgente</SelectItem><SelectItem value="stat">STAT — imediato</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Indicação clínica</Label><Input value={indicacao} onChange={(event) => setIndicacao(event.target.value)} maxLength={500} placeholder="Motivo clínico ou informação relevante" /></div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>Exames solicitados *</Label><Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setExames((lista) => [...lista, { catalogId: '', nome: '' }])} disabled={exames.length >= 40 || criarPedido.isPending}><Plus className="h-3.5 w-3.5" /> Adicionar exame</Button></div>
              {catalogoQuery.isError && <ErrorState compact title="Não foi possível carregar o catálogo; você ainda pode informar o nome manualmente." error={catalogoQuery.error} onRetry={() => void catalogoQuery.refetch()} />}
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
              <p className="text-xs text-muted-foreground">Os exames serão vinculados ao cadastro clínico existente e poderão ser processados pela worklist.</p>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/[0.04] p-3 text-xs text-muted-foreground"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>O status do pedido acompanha os status dos exames vinculados; alterações são registradas no histórico.</p></div>
          </form>
          <DialogFooter><Button type="button" variant="outline" onClick={limparFormulario} disabled={criarPedido.isPending}>Cancelar</Button><Button type="submit" form="novo-pedido-lab" disabled={criarPedido.isPending || !pacienteId} className="gap-2">{criarPedido.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Registrar pedido</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pedidoSelecionado} onOpenChange={(aberto) => { if (!aberto) setPedidoSelecionado(null); }}>
        <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Histórico do pedido</DialogTitle><DialogDescription>Registro cronológico das mudanças deste pedido.</DialogDescription></DialogHeader>
          {eventosQuery.isError ? <ErrorState compact title="Não foi possível carregar o histórico" error={eventosQuery.error} onRetry={() => void eventosQuery.refetch()} /> : eventosQuery.isLoading ? <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…</div> : (eventosQuery.data?.length ?? 0) === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum evento registrado.</p> : <ol className="max-h-[55vh] space-y-4 overflow-y-auto py-2">{eventosQuery.data?.map((evento) => <li key={evento.id} className="relative flex gap-3"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-4 ring-primary/10" /><div className="min-w-0"><p className="text-sm font-medium">{evento.tipo === 'pedido_criado' ? 'Pedido criado' : `Status: ${statusLabel[evento.status_anterior ?? ''] ?? evento.status_anterior ?? '—'} → ${statusLabel[evento.status_novo ?? ''] ?? evento.status_novo ?? '—'}`}</p><p className="mt-1 text-xs text-muted-foreground">{dataHora(evento.created_at)}</p></div></li>)}</ol>}
        </DialogContent>
      </Dialog>
    </section>
  );
}
