import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, Clock3, Loader2, Plus, ShieldCheck, SprayCan } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';

type Room = { id: string; nome: string; status: string; localizacao: string | null };
type Item = { id: string; label: string; required: boolean; completed?: boolean };
type Checklist = { id: string; version: number; title: string; items: Item[]; created_at: string };
type Execution = { id: string; room_id: string; checklist_version_id: string; started_by: string; started_at: string; submitted_by: string | null; submitted_at: string | null; completed_items: Item[] | null; notes: string | null };
type Review = { id: string; execution_id: string; reviewer_id: string; decision: 'approved' | 'rejected'; note: string; created_at: string };
type Data = { rooms: Room[]; activeChecklistId: string | null; checklists: Checklist[]; executions: Execution[]; reviews: Review[]; canReview: boolean; canConfigure: boolean };
const EMPTY: Data = { rooms: [], activeChecklistId: null, checklists: [], executions: [], reviews: [], canReview: false, canConfigure: false };
const fmt = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export default function HigieneSalas() {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('Higienização entre atendimentos');
  const [itemText, setItemText] = useState('Higienizar superfícies de contato\nTrocar descartáveis e forros\nDescartar resíduos conforme protocolo\nRepor materiais para o próximo atendimento');
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [executionNotes, setExecutionNotes] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

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
  const pendingReview = data.executions.filter((item) => item.submitted_at && !reviewByExecution.has(item.id));
  const pendingReviewRoomIds = useMemo(() => new Set(pendingReview.map((item) => item.room_id)), [pendingReview]);

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
    onSuccess: () => { toast.success('Nova versão do checklist ativada'); void refresh(); },
    onError: (error) => toast.error(error.message || 'Não foi possível salvar o checklist'),
  });

  if (query.isLoading) return <main className="space-y-5"><PageHeader title="Higienização de salas" description="Checklists, inspeções e liberação segura de ambientes" icon={<SprayCan />} /><div className="grid gap-4 md:grid-cols-2"><Card className="h-36 animate-pulse" /><Card className="h-36 animate-pulse" /></div></main>;
  if (query.error) return <ErrorState title="Não foi possível carregar a higienização" description="A operação foi pausada para evitar liberar uma sala com estado desatualizado." error={query.error} onRetry={() => void query.refetch()} />;

  return <main className="space-y-6">
    <PageHeader title="Higienização de salas" description="Checklists, inspeções e liberação segura de ambientes" icon={<SprayCan />} />
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardContent className="flex items-center gap-3 p-4"><SprayCan className="h-5 w-5 text-amber-600" /><div><p className="text-2xl font-semibold">{data.rooms.filter((room) => room.status === 'limpeza').length}</p><p className="text-sm text-muted-foreground">Em higienização</p></div></CardContent></Card>
      <Card><CardContent className="flex items-center gap-3 p-4"><Clock3 className="h-5 w-5 text-blue-600" /><div><p className="text-2xl font-semibold">{pendingReview.length}</p><p className="text-sm text-muted-foreground">Aguardando revisão</p></div></CardContent></Card>
      <Card><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><p className="text-2xl font-semibold">{data.rooms.filter((room) => room.status === 'disponivel').length}</p><p className="text-sm text-muted-foreground">Disponíveis</p></div></CardContent></Card>
    </div>

    {data.canConfigure && <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5" />Checklist vigente</CardTitle><CardDescription>{activeChecklist ? `Versão ${activeChecklist.version} · ${activeChecklist.title}. Alterar os itens cria uma nova versão; execuções anteriores preservam o checklist usado.` : 'Configure a primeira versão antes de iniciar uma higienização.'}</CardDescription></CardHeader>
      <CardContent><form className="grid gap-3 md:grid-cols-[1fr_2fr_auto]" onSubmit={(event) => { event.preventDefault(); createChecklist.mutate(); }}>
        <div className="space-y-2"><Label htmlFor="hygiene-title">Nome do checklist</Label><Input id="hygiene-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} /></div>
        <div className="space-y-2"><Label htmlFor="hygiene-items">Um item obrigatório por linha</Label><Textarea id="hygiene-items" value={itemText} onChange={(event) => setItemText(event.target.value)} rows={4} maxLength={5000} /></div>
        <div className="flex items-end"><Button type="submit" disabled={createChecklist.isPending || !title.trim() || !itemText.trim()}>{createChecklist.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Versionar</Button></div>
      </form>{activeChecklist && <ul className="mt-4 grid gap-2 sm:grid-cols-2">{activeChecklist.items.map((item) => <li key={item.id} className="text-sm">• {item.label} <Badge variant="outline" className="ml-1">Obrigatório</Badge></li>)}</ul>}</CardContent>
    </Card>}

    <section className="space-y-3" aria-labelledby="rooms-heading"><h2 id="rooms-heading" className="text-xl font-semibold">Salas</h2>
      {data.rooms.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhuma sala cadastrada nesta unidade.</CardContent></Card> : <div className="grid gap-3 lg:grid-cols-2">{data.rooms.map((room) => {
        const open = openByRoom.get(room.id);
        const checklist = open ? data.checklists.find((item) => item.id === open.checklist_version_id) : activeChecklist;
        return <Card key={room.id} className="overflow-hidden"><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{room.nome}</CardTitle><CardDescription>{room.localizacao || 'Local não informado'}</CardDescription></div><Badge variant={room.status === 'disponivel' ? 'secondary' : room.status === 'limpeza' ? 'outline' : 'destructive'}>{room.status === 'disponivel' ? 'Disponível' : room.status === 'limpeza' ? 'Em higienização' : room.status === 'ocupado' ? 'Em uso' : 'Indisponível'}</Badge></div></CardHeader><CardContent className="space-y-3">
          {!open && <Button size="sm" variant="outline" disabled={!activeChecklist || room.status === 'ocupado' || room.status === 'manutencao' || pendingReviewRoomIds.has(room.id) || mutation.isPending} onClick={() => mutation.mutate({ action: 'start', room_id: room.id })}><SprayCan className="mr-2 h-4 w-4" />Iniciar higienização</Button>}
          {pendingReviewRoomIds.has(room.id) && <p className="text-sm font-medium text-amber-700">Higienização enviada; sala bloqueada até revisão.</p>}
          {open && checklist && <div className="space-y-3 rounded-lg border bg-muted/20 p-3"><p className="text-sm font-medium">Checklist v{checklist.version} · iniciado {fmt(open.started_at)}</p>{checklist.items.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-2 text-sm"><Checkbox checked={completed[item.id] ?? false} disabled={Boolean(open.submitted_at)} onCheckedChange={(checked) => setCompleted((current) => ({ ...current, [item.id]: checked === true }))} /><span>{item.label}{item.required && <span className="text-destructive"> *</span>}</span></label>)}<div className="space-y-1"><Label htmlFor={`notes-${open.id}`}>Observação da execução</Label><Textarea id={`notes-${open.id}`} maxLength={1000} rows={2} value={executionNotes} disabled={Boolean(open.submitted_at)} onChange={(event) => setExecutionNotes(event.target.value)} /></div>{!open.submitted_at && <Button size="sm" disabled={mutation.isPending || checklist.items.some((item) => item.required && !(completed[item.id] ?? false))} onClick={() => mutation.mutate({ action: 'submit', execution_id: open.id, completed_items: checklist.items.map((item) => ({ ...item, completed: completed[item.id] ?? false })), notes: executionNotes })}>Enviar para revisão</Button>}{open.submitted_at && <p className="text-sm text-muted-foreground">Enviado para revisão em {fmt(open.submitted_at)}. A sala permanece bloqueada.</p>}</div>}
          </CardContent></Card>;
      })}</div>}
    </section>

    {data.canReview && pendingReview.length > 0 && <section className="space-y-3" aria-labelledby="review-heading"><h2 id="review-heading" className="text-xl font-semibold">Inspeção e liberação</h2><div className="grid gap-3 lg:grid-cols-2">{pendingReview.map((execution) => { const room = data.rooms.find((item) => item.id === execution.room_id); const checklist = data.checklists.find((item) => item.id === execution.checklist_version_id); return <Card key={execution.id}><CardHeader><CardTitle className="text-base">{room?.nome || 'Sala'} · revisão</CardTitle><CardDescription>Enviado {fmt(execution.submitted_at!)} · checklist v{checklist?.version ?? '?'}</CardDescription></CardHeader><CardContent className="space-y-3"><ul className="space-y-1 text-sm">{(execution.completed_items || []).map((item) => <li key={item.id} className="flex items-center gap-2">{item.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <span className="h-4 w-4 rounded-full border" />}{item.label}</li>)}</ul>{execution.notes && <p className="rounded bg-muted p-2 text-sm">{execution.notes}</p>}<div className="space-y-1"><Label htmlFor={`review-${execution.id}`}>Observação da inspeção *</Label><Textarea id={`review-${execution.id}`} minLength={3} maxLength={1000} rows={2} value={reviewNotes[execution.id] || ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [execution.id]: event.target.value }))} /></div><div className="flex flex-wrap gap-2"><Button size="sm" disabled={mutation.isPending || (reviewNotes[execution.id] || '').trim().length < 3} onClick={() => mutation.mutate({ action: 'review', execution_id: execution.id, decision: 'approved', note: reviewNotes[execution.id] })}><ShieldCheck className="mr-2 h-4 w-4" />Aprovar e liberar sala</Button><Button size="sm" variant="destructive" disabled={mutation.isPending || (reviewNotes[execution.id] || '').trim().length < 3} onClick={() => mutation.mutate({ action: 'review', execution_id: execution.id, decision: 'rejected', note: reviewNotes[execution.id] })}>Reprovar e manter bloqueada</Button></div></CardContent></Card>; })}</div></section>}

    <section className="space-y-3" aria-labelledby="history-heading"><h2 id="history-heading" className="text-xl font-semibold">Histórico recente</h2>{data.executions.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">As execuções e inspeções aparecerão aqui. Nenhuma alteração foi feita nas salas.</CardContent></Card> : <Card><CardContent className="divide-y p-0">{data.executions.slice(0, 15).map((execution) => { const room = data.rooms.find((item) => item.id === execution.room_id); const review = reviewByExecution.get(execution.id); return <div key={execution.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span><strong>{room?.nome || 'Sala'}</strong> · {fmt(execution.started_at)}</span><Badge variant={review?.decision === 'approved' ? 'secondary' : review?.decision === 'rejected' ? 'destructive' : execution.submitted_at ? 'outline' : 'default'}>{review?.decision === 'approved' ? 'Aprovada · sala liberada' : review?.decision === 'rejected' ? 'Reprovada · segue bloqueada' : execution.submitted_at ? 'Aguardando inspeção' : 'Em execução'}</Badge></div>; })}</CardContent></Card>}</section>
  </main>;
}
