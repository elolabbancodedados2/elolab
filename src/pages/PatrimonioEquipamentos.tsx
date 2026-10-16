import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, FileUp, Loader2, Plus, ShieldCheck, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';

type Asset = { id: string; room_id: string | null; name: string; category: string; manufacturer: string | null; model: string | null; serial_number: string | null; asset_tag: string | null; acquired_on: string | null; warranty_until: string | null; calibration_due: string | null; maintenance_interval_days: number | null; responsible_user_id: string | null; status: 'active' | 'maintenance' | 'unavailable' | 'retired'; block_room_when_unavailable: boolean; created_at: string; updated_at: string };
type Order = { id: string; asset_id: string; kind: string; status: 'open' | 'in_progress' | 'completed' | 'cancelled'; priority: string; title: string; description: string | null; due_on: string | null; assigned_to: string | null; opened_by: string; completion_note: string | null; completed_at: string | null; created_at: string; updated_at: string };
type Document = { id: string; asset_id: string; file_name: string; content_type: string; byte_size: number; uploaded_by: string; created_at: string };
type Audit = { id: number; asset_id: string | null; work_order_id: string | null; document_id: string | null; actor_id: string | null; action: string; details: Record<string, unknown>; created_at: string };
type Profile = { id: string; nome: string };
type Room = { id: string; nome: string; status: string };
type Data = { assets: Asset[]; orders: Order[]; documents: Document[]; audit: Audit[]; rooms: Room[]; profiles: Profile[]; canManageAssets: boolean; canMaintain: boolean; canOpenOrders: boolean };
const EMPTY: Data = { assets: [], orders: [], documents: [], audit: [], rooms: [], profiles: [], canManageAssets: false, canMaintain: false, canOpenOrders: false };
const BUCKET = 'clinic-equipment-documents';
const CATEGORIES: Record<string, string> = { clinical: 'Assistencial', diagnostic: 'Diagnóstico', it: 'Informática', facility: 'Infraestrutura', other: 'Outro' };
const STATUSES: Record<string, string> = { active: 'Em operação', maintenance: 'Em manutenção', unavailable: 'Indisponível', retired: 'Aposentado' };
const ORDER_KINDS: Record<string, string> = { preventive: 'Preventiva', corrective: 'Corretiva', calibration: 'Calibração', inspection: 'Inspeção' };
const ORDER_STATUS: Record<string, string> = { open: 'Aberta', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' };
const fmt = (date: string | null) => date ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

export default function PatrimonioEquipamentos() {
  const { profile } = useSupabaseAuth();
  const client = useQueryClient();
  const [assetForm, setAssetForm] = useState({ name: '', category: 'clinical', room_id: '', manufacturer: '', model: '', serial_number: '', asset_tag: '', acquired_on: '', warranty_until: '', calibration_due: '', maintenance_interval_days: '', responsible_user_id: '', block_room_when_unavailable: false });
  const [orderForm, setOrderForm] = useState({ asset_id: '', kind: 'preventive', title: '', description: '', due_on: '', assigned_to: '', priority: 'normal' });
  const [completionNotes, setCompletionNotes] = useState<Record<string, string>>({});
  const [calibrationDates, setCalibrationDates] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ['clinic-equipment', profile?.clinica_id],
    enabled: Boolean(profile?.clinica_id),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('patrimonio-equipamentos', { body: { action: 'list' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as Data;
    },
    refetchInterval: 30_000,
  });
  const data = query.data ?? EMPTY;
  const roomNames = useMemo(() => new Map(data.rooms.map((room) => [room.id, room.nome])), [data.rooms]);
  const profilesById = useMemo(() => new Map(data.profiles.map((person) => [person.id, person.nome])), [data.profiles]);
  const assetById = useMemo(() => new Map(data.assets.map((asset) => [asset.id, asset])), [data.assets]);
  const documentsByAsset = useMemo(() => {
    const map = new Map<string, Document[]>();
    for (const doc of data.documents) map.set(doc.asset_id, [...(map.get(doc.asset_id) ?? []), doc]);
    return map;
  }, [data.documents]);

  const invoke = async (body: Record<string, unknown>) => {
    const { data: result, error } = await supabase.functions.invoke('patrimonio-equipamentos', { body });
    if (error) throw error;
    if (result?.error) throw new Error(result.error);
    return result;
  };
  const refresh = () => client.invalidateQueries({ queryKey: ['clinic-equipment', profile?.clinica_id] });
  const operation = useMutation({ mutationFn: invoke, onSuccess: () => void refresh(), onError: (error) => toast.error(error.message || 'Operação não concluída') });
  const createAsset = useMutation({
    mutationFn: () => invoke({ action: 'create_asset', asset: { ...assetForm, room_id: assetForm.room_id || null,
      maintenance_interval_days: assetForm.maintenance_interval_days ? Number(assetForm.maintenance_interval_days) : null,
      acquired_on: assetForm.acquired_on || null, warranty_until: assetForm.warranty_until || null,
      calibration_due: assetForm.calibration_due || null, responsible_user_id: assetForm.responsible_user_id || null } }),
    onSuccess: () => { toast.success('Equipamento cadastrado'); setAssetForm((form) => ({ ...form, name: '', serial_number: '', asset_tag: '' })); void refresh(); },
    onError: (error) => toast.error(error.message || 'Não foi possível cadastrar o equipamento'),
  });
  const createOrder = useMutation({
    mutationFn: () => invoke({ action: 'create_order', order: { ...orderForm, due_on: orderForm.due_on || null, assigned_to: orderForm.assigned_to || null } }),
    onSuccess: () => { toast.success('Ordem de serviço aberta'); setOrderForm((form) => ({ ...form, title: '', description: '', due_on: '' })); void refresh(); },
    onError: (error) => toast.error(error.message || 'Não foi possível abrir a ordem'),
  });

  const uploadDocument = async (asset: Asset, file: File) => {
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
      toast.error('Use PDF, PNG ou JPEG de até 10 MB.'); return;
    }
    const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'documento';
    const path = `${profile?.clinica_id}/${asset.id}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
    if (error) { toast.error('Falha no envio do documento.'); return; }
    try {
      await invoke({ action: 'add_document', asset_id: asset.id, storage_path: path, file_name: file.name.slice(0, 180), content_type: file.type, byte_size: file.size });
      toast.success('Documento anexado'); await refresh();
    } catch (error) {
      await invoke({ action: 'cleanup_upload', storage_path: path }).catch(() => undefined);
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar o documento.');
    }
  };
  const openDocument = async (id: string) => {
    try { const result = await invoke({ action: 'document_url', document_id: id }); window.open(result.url, '_blank', 'noopener,noreferrer'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Documento indisponível.'); }
  };

  if (query.isLoading) return <main className="space-y-5"><PageHeader title="Patrimônio e manutenção" description="Ativos, calibrações, ordens de serviço e documentos" icon={<Wrench />} /><Card className="h-40 animate-pulse" /></main>;
  if (query.error) return <ErrorState title="Não foi possível carregar o patrimônio" description="Nenhuma alteração será feita até confirmar o estado atual dos equipamentos." error={query.error} onRetry={() => void query.refetch()} />;

  return <main className="space-y-6">
    <PageHeader title="Patrimônio e manutenção" description="Ativos clínicos e da infraestrutura, ordens de serviço, calibrações e documentos." icon={<Wrench />} />
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-4"><p className="text-2xl font-semibold">{data.assets.filter((asset) => asset.status === 'active').length}</p><p className="text-sm text-muted-foreground">Em operação</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-2xl font-semibold">{data.orders.filter((order) => ['open', 'in_progress'].includes(order.status)).length}</p><p className="text-sm text-muted-foreground">Ordens abertas</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-2xl font-semibold">{data.assets.filter((asset) => asset.calibration_due && asset.calibration_due <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)).length}</p><p className="text-sm text-muted-foreground">Calibração vence em 30 dias</p></CardContent></Card></div>

    {data.canManageAssets && <Card><CardHeader><CardTitle className="text-lg">Cadastrar ativo da clínica</CardTitle><CardDescription>Cadastro geral de patrimônio. Analisadores permanecem cadastrados no painel do laboratório.</CardDescription></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => { event.preventDefault(); createAsset.mutate(); }}>
      <div className="space-y-1"><Label htmlFor="asset-name">Nome *</Label><Input id="asset-name" required maxLength={160} value={assetForm.name} onChange={(event) => setAssetForm({ ...assetForm, name: event.target.value })} /></div>
      <div className="space-y-1"><Label>Categoria</Label><Select value={assetForm.category} onValueChange={(category) => setAssetForm({ ...assetForm, category })}><SelectTrigger aria-label="Categoria"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORIES).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Sala / localização</Label><Select value={assetForm.room_id || '__none__'} onValueChange={(room_id) => setAssetForm({ ...assetForm, room_id: room_id === '__none__' ? '' : room_id })}><SelectTrigger aria-label="Sala / localização"><SelectValue placeholder="Sem sala fixa" /></SelectTrigger><SelectContent><SelectItem value="__none__">Sem sala fixa</SelectItem>{data.rooms.map((room) => <SelectItem key={room.id} value={room.id}>{room.nome}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Patrimônio</Label><Input aria-label="Patrimônio" maxLength={80} value={assetForm.asset_tag} onChange={(event) => setAssetForm({ ...assetForm, asset_tag: event.target.value })} /></div>
      <div className="space-y-1"><Label>Fabricante</Label><Input maxLength={120} value={assetForm.manufacturer} onChange={(event) => setAssetForm({ ...assetForm, manufacturer: event.target.value })} /></div>
      <div className="space-y-1"><Label>Modelo</Label><Input maxLength={120} value={assetForm.model} onChange={(event) => setAssetForm({ ...assetForm, model: event.target.value })} /></div>
      <div className="space-y-1"><Label>Número de série</Label><Input maxLength={120} value={assetForm.serial_number} onChange={(event) => setAssetForm({ ...assetForm, serial_number: event.target.value })} /></div>
      <div className="space-y-1"><Label>Responsável</Label><Select value={assetForm.responsible_user_id || '__none__'} onValueChange={(responsible_user_id) => setAssetForm({ ...assetForm, responsible_user_id: responsible_user_id === '__none__' ? '' : responsible_user_id })}><SelectTrigger aria-label="Responsável pelo ativo"><SelectValue placeholder="Sem responsável" /></SelectTrigger><SelectContent><SelectItem value="__none__">Sem responsável</SelectItem>{data.profiles.map((person) => <SelectItem key={person.id} value={person.id}>{person.nome}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Adquirido em</Label><Input type="date" value={assetForm.acquired_on} onChange={(event) => setAssetForm({ ...assetForm, acquired_on: event.target.value })} /></div>
      <div className="space-y-1"><Label>Garantia até</Label><Input type="date" value={assetForm.warranty_until} onChange={(event) => setAssetForm({ ...assetForm, warranty_until: event.target.value })} /></div>
      <div className="space-y-1"><Label>Calibração até</Label><Input aria-label="Calibração até" type="date" value={assetForm.calibration_due} onChange={(event) => setAssetForm({ ...assetForm, calibration_due: event.target.value })} /></div>
      <div className="space-y-1"><Label>Manutenção a cada (dias)</Label><Input type="number" min="1" max="3650" value={assetForm.maintenance_interval_days} onChange={(event) => setAssetForm({ ...assetForm, maintenance_interval_days: event.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={assetForm.block_room_when_unavailable} onCheckedChange={(checked) => setAssetForm({ ...assetForm, block_room_when_unavailable: checked === true })} />Bloquear disponibilidade da sala se este equipamento ficar indisponível</label>
      <div className="flex items-end"><Button type="submit" disabled={createAsset.isPending || !assetForm.name.trim()}>{createAsset.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Cadastrar ativo</Button></div>
    </form></CardContent></Card>}

    {data.canOpenOrders && <Card><CardHeader><CardTitle className="text-lg">Abrir ordem de serviço</CardTitle><CardDescription>Registre manutenção preventiva, corretiva, inspeção ou calibração com prazo e responsável. A equipe autorizada atualiza e conclui a ordem.</CardDescription></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => { event.preventDefault(); createOrder.mutate(); }}>
      <div className="space-y-1"><Label>Equipamento *</Label><Select value={orderForm.asset_id} onValueChange={(asset_id) => setOrderForm({ ...orderForm, asset_id })}><SelectTrigger aria-label="Equipamento da ordem"><SelectValue placeholder="Selecionar ativo" /></SelectTrigger><SelectContent>{data.assets.filter((asset) => asset.status !== 'retired').map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.name}{asset.asset_tag ? ` · ${asset.asset_tag}` : ''}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Tipo</Label><Select value={orderForm.kind} onValueChange={(kind) => setOrderForm({ ...orderForm, kind })}><SelectTrigger aria-label="Tipo de ordem"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ORDER_KINDS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Título *</Label><Input aria-label="Título da ordem *" required minLength={3} maxLength={160} value={orderForm.title} onChange={(event) => setOrderForm({ ...orderForm, title: event.target.value })} /></div>
      <div className="space-y-1"><Label>Prioridade</Label><Select value={orderForm.priority} onValueChange={(priority) => setOrderForm({ ...orderForm, priority })}><SelectTrigger aria-label="Prioridade da ordem"><SelectValue /></SelectTrigger><SelectContent>{[['low','Baixa'],['normal','Normal'],['high','Alta'],['urgent','Urgente']].map(([key,label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Prazo</Label><Input type="date" value={orderForm.due_on} onChange={(event) => setOrderForm({ ...orderForm, due_on: event.target.value })} /></div>
      <div className="space-y-1"><Label>Responsável</Label><Select value={orderForm.assigned_to || '__none__'} onValueChange={(assigned_to) => setOrderForm({ ...orderForm, assigned_to: assigned_to === '__none__' ? '' : assigned_to })}><SelectTrigger aria-label="Responsável pela ordem"><SelectValue placeholder="A definir" /></SelectTrigger><SelectContent><SelectItem value="__none__">A definir</SelectItem>{data.profiles.map((person) => <SelectItem key={person.id} value={person.id}>{person.nome}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1 sm:col-span-2"><Label>Descrição</Label><Textarea maxLength={2000} rows={2} value={orderForm.description} onChange={(event) => setOrderForm({ ...orderForm, description: event.target.value })} /></div>
      <div className="flex items-end"><Button type="submit" disabled={createOrder.isPending || !orderForm.asset_id || orderForm.title.trim().length < 3}>{createOrder.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Abrir ordem</Button></div>
    </form></CardContent></Card>}

    <section className="space-y-3" aria-labelledby="equipment-list-heading"><h2 id="equipment-list-heading" className="text-xl font-semibold">Ativos cadastrados</h2>{data.assets.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum ativo patrimonial cadastrado. Os equipamentos dos setores laboratoriais continuam na gestão do laboratório.</CardContent></Card> : <div className="grid gap-3 xl:grid-cols-2">{data.assets.map((asset) => {
      const orders = data.orders.filter((order) => order.asset_id === asset.id);
      const docs = documentsByAsset.get(asset.id) ?? [];
      const dueSoon = asset.calibration_due && asset.calibration_due <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      const calibrationExpired = asset.calibration_due && asset.calibration_due < new Date().toISOString().slice(0, 10);
      return <Card key={asset.id} className="overflow-hidden"><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{asset.name}</CardTitle><CardDescription>{CATEGORIES[asset.category]} · {roomNames.get(asset.room_id || '') || 'Sem sala fixa'}{asset.asset_tag ? ` · ${asset.asset_tag}` : ''}</CardDescription></div><Badge variant={asset.status === 'active' ? 'secondary' : asset.status === 'retired' ? 'outline' : 'destructive'}>{STATUSES[asset.status]}</Badge></div></CardHeader><CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2 text-muted-foreground"><p>Série: {asset.serial_number || '—'}</p><p>Modelo: {asset.model || '—'}</p><p>Responsável: {profilesById.get(asset.responsible_user_id || '') || 'A definir'}</p><p>Garantia: {fmt(asset.warranty_until)}</p><p className={dueSoon ? 'font-medium text-amber-700' : ''}><CalendarClock className="mr-1 inline h-3.5 w-3.5" />Calibração: {fmt(asset.calibration_due)} {calibrationExpired ? <span className="text-destructive">· vencida</span> : dueSoon && '· vence em breve'}</p><p>Manutenção: {asset.maintenance_interval_days ? `a cada ${asset.maintenance_interval_days} dias` : 'sem periodicidade'}</p></div>
        {asset.block_room_when_unavailable && <p className="flex items-center gap-2 rounded-md bg-amber-50 p-2 text-amber-900"><ShieldCheck className="h-4 w-4 shrink-0" />A sala fica bloqueada se este equipamento estiver fora de operação.</p>}
        {data.canMaintain && asset.status !== 'retired' && <div className="flex flex-wrap gap-2">{asset.status !== 'active' && <Button size="sm" variant="outline" disabled={operation.isPending} onClick={() => operation.mutate({ action: 'update_asset', asset_id: asset.id, expected_updated_at: asset.updated_at, patch: { status: 'active' } })}>Marcar em operação</Button>}{asset.status === 'active' && <><Button size="sm" variant="outline" disabled={operation.isPending} onClick={() => operation.mutate({ action: 'update_asset', asset_id: asset.id, expected_updated_at: asset.updated_at, patch: { status: 'maintenance' } })}>Enviar para manutenção</Button><Button size="sm" variant="outline" disabled={operation.isPending} onClick={() => operation.mutate({ action: 'update_asset', asset_id: asset.id, expected_updated_at: asset.updated_at, patch: { status: 'unavailable' } })}>Marcar indisponível</Button></>}{data.canManageAssets && <Button size="sm" variant="ghost" disabled={operation.isPending} onClick={() => operation.mutate({ action: 'update_asset', asset_id: asset.id, expected_updated_at: asset.updated_at, patch: { status: 'retired' } })}>Aposentar</Button>}</div>}
        {data.canMaintain && asset.status !== 'retired' && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const date = calibrationDates[asset.id] ?? asset.calibration_due ?? ''; operation.mutate({ action: 'update_asset', asset_id: asset.id, expected_updated_at: asset.updated_at, patch: { calibration_due: date || null } }); }}><div className="space-y-1"><Label htmlFor={`calibration-${asset.id}`}>Próxima calibração</Label><Input id={`calibration-${asset.id}`} type="date" value={calibrationDates[asset.id] ?? asset.calibration_due ?? ''} onChange={(event) => setCalibrationDates({ ...calibrationDates, [asset.id]: event.target.value })} /></div><Button size="sm" type="submit" variant="outline" disabled={operation.isPending}>Atualizar prazo</Button></form>}
        {docs.length > 0 && <div className="space-y-1"><p className="font-medium">Documentos</p>{docs.map((doc) => <div key={doc.id} className="flex items-center justify-between gap-2"><span className="truncate">{doc.file_name} · {(doc.byte_size / 1024).toFixed(0)} KB</span><Button size="sm" variant="link" onClick={() => void openDocument(doc.id)}>Abrir</Button></div>)}</div>}
        {data.canMaintain && asset.status !== 'retired' && <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2"><FileUp className="h-4 w-4" />Anexar PDF ou imagem<input className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(asset, file); event.currentTarget.value = ''; }} /></Label>}
        {orders.length > 0 && <div className="space-y-2 border-t pt-3"><p className="font-medium">Ordens de serviço</p>{orders.slice(0, 5).map((order) => <div key={order.id} className="rounded-md border p-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{order.title} · {ORDER_KINDS[order.kind]}</span><Badge variant={order.status === 'completed' ? 'secondary' : order.status === 'cancelled' ? 'outline' : 'default'}>{ORDER_STATUS[order.status]}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{order.priority.toUpperCase()} · prazo {fmt(order.due_on)} · {profilesById.get(order.assigned_to || '') || 'Sem responsável'}</p>{order.description && <p className="mt-1 text-xs">{order.description}</p>}{order.status === 'open' && data.canMaintain && <Button size="sm" variant="outline" className="mt-2" onClick={() => operation.mutate({ action: 'update_order', work_order_id: order.id, expected_updated_at: order.updated_at, patch: { status: 'in_progress' } })}>Iniciar serviço</Button>}{order.status === 'in_progress' && data.canMaintain && <div className="mt-2 flex gap-2"><Input aria-label={`Serviço executado em ${order.title}`} placeholder="Serviço executado *" maxLength={2000} value={completionNotes[order.id] || ''} onChange={(event) => setCompletionNotes({ ...completionNotes, [order.id]: event.target.value })} /><Button size="sm" disabled={(completionNotes[order.id] || '').trim().length < 3 || operation.isPending} onClick={() => operation.mutate({ action: 'update_order', work_order_id: order.id, expected_updated_at: order.updated_at, patch: { status: 'completed', completion_note: completionNotes[order.id] } })}>Concluir</Button></div>}{order.completion_note && <p className="mt-1 rounded bg-muted p-2 text-xs">Concluído: {order.completion_note}</p>}</div>)}</div>}
      </CardContent></Card>;
    })}</div>}</section>

    <section className="space-y-3" aria-labelledby="equipment-history-heading"><h2 id="equipment-history-heading" className="text-xl font-semibold">Histórico de auditoria</h2>{data.audit.length === 0 ? <Card><CardContent className="p-5 text-sm text-muted-foreground">Cadastros, alterações, ordens e documentos serão registrados aqui.</CardContent></Card> : <Card><CardContent className="divide-y p-0">{data.audit.slice(0, 25).map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span>{event.action.replace(/_/g, ' ')} · {event.asset_id ? assetById.get(event.asset_id)?.name || 'Ativo arquivado' : event.work_order_id ? 'Ordem de serviço' : 'Documento'}</span><span className="text-muted-foreground">{profilesById.get(event.actor_id || '') || 'Equipe'} · {new Date(event.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></div>)}</CardContent></Card>}</section>
  </main>;
}
