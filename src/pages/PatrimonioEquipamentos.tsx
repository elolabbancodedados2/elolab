import { formatDate } from '@/lib/formatters';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, DoorOpen, FileUp, History, Loader2, Package,
  Plus, RefreshCw, Search, ShieldCheck, Wrench, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState, friendlyErrorMessage } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { normalizarTexto } from '@/lib/buscaPaciente';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';

type Asset = { id: string; room_id: string | null; name: string; category: string; manufacturer: string | null; model: string | null; serial_number: string | null; asset_tag: string | null; acquired_on: string | null; warranty_until: string | null; calibration_due: string | null; maintenance_interval_days: number | null; responsible_user_id: string | null; status: 'active' | 'maintenance' | 'unavailable' | 'retired'; block_room_when_unavailable: boolean; created_at: string; updated_at: string };
type Order = { id: string; asset_id: string; kind: string; status: 'open' | 'in_progress' | 'completed' | 'cancelled'; priority: string; title: string; description: string | null; due_on: string | null; assigned_to: string | null; opened_by: string; completion_note: string | null; completed_at: string | null; created_at: string; updated_at: string };
type Document = { id: string; asset_id: string; file_name: string; content_type: string; byte_size: number; uploaded_by: string; created_at: string };
type Audit = { id: number; asset_id: string | null; work_order_id: string | null; document_id: string | null; actor_id: string | null; action: string; details: Record<string, unknown>; created_at: string };
type Profile = { id: string; nome: string };
type Room = { id: string; nome: string; status: string };
type Data = { assets: Asset[]; orders: Order[]; documents: Document[]; audit: Audit[]; rooms: Room[]; profiles: Profile[]; canManageAssets: boolean; canMaintain: boolean; canOpenOrders: boolean };
type Indicador = 'vencida' | 'em30' | 'manutencao' | 'operacional';
type Urgencia = 'vencida' | 'em30' | 'futura' | 'sem_prazo';
type Prazo = { date: string | null; origem: 'calibracao' | 'ordem' | null; dias: number | null; urgencia: Urgencia };

const SEM_PRAZO: Prazo = { date: null, origem: null, dias: null, urgencia: 'sem_prazo' };
const EMPTY: Data = { assets: [], orders: [], documents: [], audit: [], rooms: [], profiles: [], canManageAssets: false, canMaintain: false, canOpenOrders: false };
const BUCKET = 'clinic-equipment-documents';
const CATEGORIES: Record<string, string> = { clinical: 'Assistencial', diagnostic: 'Diagnóstico', it: 'Informática', facility: 'Infraestrutura', other: 'Outro' };
const STATUSES: Record<string, string> = { active: 'Em operação', maintenance: 'Em manutenção', unavailable: 'Indisponível', retired: 'Aposentado' };
const STATUS_BADGE: Record<Asset['status'], string> = {
  active: 'border-success/30 bg-success/10 text-success',
  maintenance: 'border-warning/40 bg-warning/10 text-warning-foreground',
  unavailable: 'border-destructive/30 bg-destructive/10 text-destructive',
  retired: 'border-border bg-muted text-muted-foreground',
};
const ORDER_KINDS: Record<string, string> = { preventive: 'Preventiva', corrective: 'Corretiva', calibration: 'Calibração', inspection: 'Inspeção' };
const ORDER_STATUS: Record<string, string> = { open: 'Aberta', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' };
const ORDER_BADGE: Record<Order['status'], string> = {
  open: 'border-warning/40 bg-warning/10 text-warning-foreground',
  in_progress: 'border-[#1080CA]/30 bg-[#1080CA]/10 text-[#1080CA]',
  completed: 'border-success/30 bg-success/10 text-success',
  cancelled: 'border-border bg-muted text-muted-foreground',
};
const PRIORIDADES: Record<string, string> = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
const INDICADOR_LABEL: Record<Indicador, string> = { vencida: 'manutenção vencida', em30: 'vencimento em 30 dias', manutencao: 'em manutenção', operacional: 'operacionais' };
const fmt = (date: string | null) => date ? formatDate(date.slice(0, 10), 'short') : '—';
const diasEntre = (hoje: string, date: string) => Math.round((Date.parse(`${date.slice(0, 10)}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
const plural = (n: number, singular: string, pluralForm: string) => `${n} ${n === 1 ? singular : pluralForm}`;

export default function PatrimonioEquipamentos() {
  const { profile } = useSupabaseAuth();
  const client = useQueryClient();
  const hoje = todaySaoPauloDateOnly();
  const [assetForm, setAssetForm] = useState({ name: '', category: 'clinical', room_id: '', manufacturer: '', model: '', serial_number: '', asset_tag: '', acquired_on: '', warranty_until: '', calibration_due: '', maintenance_interval_days: '', responsible_user_id: '', block_room_when_unavailable: false });
  const [orderForm, setOrderForm] = useState({ asset_id: '', kind: 'preventive', title: '', description: '', due_on: '', assigned_to: '', priority: 'normal' });
  const [completionNotes, setCompletionNotes] = useState<Record<string, string>>({});
  const [calibrationDates, setCalibrationDates] = useState<Record<string, string>>({});
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | Asset['status']>('todos');
  const [categoryFilter, setCategoryFilter] = useState('todas');
  const [indicador, setIndicador] = useState<'todos' | Indicador>('todos');
  const assetFormRef = useRef<HTMLDivElement>(null);
  const orderFormRef = useRef<HTMLDivElement>(null);

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
  const ordersByAsset = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of data.orders) map.set(order.asset_id, [...(map.get(order.asset_id) ?? []), order]);
    return map;
  }, [data.orders]);

  // Próximo prazo de manutenção por ativo: calibração ou ordem aberta/em andamento com prazo, o que vier primeiro.
  const prazoPorAtivo = useMemo(() => {
    const map = new Map<string, Prazo>();
    for (const asset of data.assets) {
      const candidatos: { date: string; origem: 'calibracao' | 'ordem' }[] = [];
      if (asset.calibration_due) candidatos.push({ date: asset.calibration_due.slice(0, 10), origem: 'calibracao' });
      for (const order of ordersByAsset.get(asset.id) ?? []) {
        if (order.due_on && (order.status === 'open' || order.status === 'in_progress')) candidatos.push({ date: order.due_on.slice(0, 10), origem: 'ordem' });
      }
      candidatos.sort((a, b) => a.date.localeCompare(b.date));
      const primeiro = candidatos[0];
      if (!primeiro || asset.status === 'retired') { map.set(asset.id, { date: null, origem: null, dias: null, urgencia: 'sem_prazo' }); continue; }
      const dias = diasEntre(hoje, primeiro.date);
      map.set(asset.id, { date: primeiro.date, origem: primeiro.origem, dias, urgencia: dias < 0 ? 'vencida' : dias <= 30 ? 'em30' : 'futura' });
    }
    return map;
  }, [data.assets, ordersByAsset, hoje]);
  const prazoDe = useCallback((asset: Asset): Prazo => prazoPorAtivo.get(asset.id) ?? SEM_PRAZO, [prazoPorAtivo]);

  const ativosNaoAposentados = useMemo(() => data.assets.filter((asset) => asset.status !== 'retired'), [data.assets]);
  const stats = useMemo(() => ({
    vencida: ativosNaoAposentados.filter((asset) => prazoDe(asset).urgencia === 'vencida').length,
    em30: ativosNaoAposentados.filter((asset) => prazoDe(asset).urgencia === 'em30').length,
    manutencao: data.assets.filter((asset) => asset.status === 'maintenance').length,
    operacional: data.assets.filter((asset) => asset.status === 'active').length,
    indisponivel: data.assets.filter((asset) => asset.status === 'unavailable').length,
    ordensAbertas: data.orders.filter((order) => order.status === 'open' || order.status === 'in_progress').length,
  }), [data.assets, data.orders, ativosNaoAposentados, prazoDe]);
  const proximaManutencao = useMemo(() => {
    const comPrazo = ativosNaoAposentados.filter((asset) => prazoDe(asset).date);
    comPrazo.sort((a, b) => (prazoDe(a).date as string).localeCompare(prazoDe(b).date as string));
    return comPrazo[0] ?? null;
  }, [ativosNaoAposentados, prazoDe]);

  const correspondeIndicador = useCallback((asset: Asset) => {
    if (indicador === 'todos') return true;
    if (indicador === 'manutencao') return asset.status === 'maintenance';
    if (indicador === 'operacional') return asset.status === 'active';
    return asset.status !== 'retired' && prazoDe(asset).urgencia === indicador;
  }, [indicador, prazoDe]);
  const filtrados = useMemo(() => {
    const termo = normalizarTexto(search);
    return data.assets.filter((asset) => {
      if (!correspondeIndicador(asset)) return false;
      if (statusFilter !== 'todos' && asset.status !== statusFilter) return false;
      if (categoryFilter !== 'todas' && asset.category !== categoryFilter) return false;
      if (!termo) return true;
      const campos = [asset.name, asset.asset_tag, asset.serial_number, asset.model, asset.manufacturer, roomNames.get(asset.room_id || ''), CATEGORIES[asset.category], STATUSES[asset.status]];
      return campos.some((valor) => normalizarTexto(String(valor ?? '')).includes(termo));
    });
  }, [data.assets, search, statusFilter, categoryFilter, roomNames, correspondeIndicador]);
  const porCategoria = useMemo(() => {
    const grupos: Record<string, Asset[]> = {};
    for (const asset of filtrados) (grupos[asset.category] ??= []).push(asset);
    for (const lista of Object.values(grupos)) {
      lista.sort((a, b) => {
        const pa = prazoDe(a).date ?? '9999-99-99'; const pb = prazoDe(b).date ?? '9999-99-99';
        return pa.localeCompare(pb) || a.name.localeCompare(b.name, 'pt-BR');
      });
    }
    return Object.entries(grupos).sort(([a], [b]) => Object.keys(CATEGORIES).indexOf(a) - Object.keys(CATEGORIES).indexOf(b));
  }, [filtrados, prazoDe]);
  const temFiltro = search.trim() !== '' || statusFilter !== 'todos' || categoryFilter !== 'todas' || indicador !== 'todos';
  const limparFiltros = () => { setSearch(''); setStatusFilter('todos'); setCategoryFilter('todas'); setIndicador('todos'); };

  const invoke = async (body: Record<string, unknown>) => {
    const { data: result, error } = await supabase.functions.invoke('patrimonio-equipamentos', { body });
    if (error) throw error;
    if (result?.error) throw new Error(result.error);
    return result;
  };
  const refresh = () => client.invalidateQueries({ queryKey: ['clinic-equipment', profile?.clinica_id] });
  const operation = useMutation({ mutationFn: invoke, onSuccess: () => void refresh(), onError: (error) => toast.error(friendlyErrorMessage(error, 'Operação não concluída. Tente novamente.')) });
  const createAsset = useMutation({
    mutationFn: () => invoke({ action: 'create_asset', asset: { ...assetForm, room_id: assetForm.room_id || null,
      maintenance_interval_days: assetForm.maintenance_interval_days ? Number(assetForm.maintenance_interval_days) : null,
      acquired_on: assetForm.acquired_on || null, warranty_until: assetForm.warranty_until || null,
      calibration_due: assetForm.calibration_due || null, responsible_user_id: assetForm.responsible_user_id || null } }),
    onSuccess: () => { toast.success('Equipamento cadastrado'); setAssetForm((form) => ({ ...form, name: '', serial_number: '', asset_tag: '' })); void refresh(); },
    onError: (error) => toast.error(friendlyErrorMessage(error, 'Não foi possível cadastrar o equipamento.')),
  });
  const createOrder = useMutation({
    mutationFn: () => invoke({ action: 'create_order', order: { ...orderForm, due_on: orderForm.due_on || null, assigned_to: orderForm.assigned_to || null } }),
    onSuccess: () => { toast.success('Ordem de serviço aberta'); setOrderForm((form) => ({ ...form, title: '', description: '', due_on: '' })); void refresh(); },
    onError: (error) => toast.error(friendlyErrorMessage(error, 'Não foi possível abrir a ordem.')),
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
      toast.error(friendlyErrorMessage(error, 'Não foi possível registrar o documento.'));
    }
  };
  const openDocument = async (id: string) => {
    try { const result = await invoke({ action: 'document_url', document_id: id }); window.open(result.url, '_blank', 'noopener,noreferrer'); }
    catch (error) { toast.error(friendlyErrorMessage(error, 'Documento indisponível.')); }
  };

  const abrirCadastro = () => {
    setShowAssetForm(true);
    window.setTimeout(() => assetFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const abrirOrdemPara = (assetId?: string, kind?: string) => {
    setOrderForm((form) => ({ ...form, asset_id: assetId ?? form.asset_id, kind: kind ?? form.kind }));
    setShowOrderForm(true);
    window.setTimeout(() => orderFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const patchAsset = (asset: Asset, patch: Record<string, unknown>) =>
    operation.mutate({ action: 'update_asset', asset_id: asset.id, expected_updated_at: asset.updated_at, patch });

  const totalAtivos = data.assets.length;
  const descricao = totalAtivos > 0
    ? [
      plural(totalAtivos, 'equipamento', 'equipamentos'),
      stats.manutencao > 0 ? `${stats.manutencao} em manutenção` : null,
      stats.vencida > 0 ? `${stats.vencida} com manutenção vencida` : null,
      stats.em30 > 0 ? `${stats.em30} vence${stats.em30 === 1 ? '' : 'm'} em 30 dias` : null,
      stats.ordensAbertas > 0 ? plural(stats.ordensAbertas, 'ordem aberta', 'ordens abertas') : null,
    ].filter(Boolean).join(' · ')
    : 'Ativos clínicos e da infraestrutura, ordens de serviço, calibrações e documentos.';

  if (query.isLoading) return <main className="space-y-5"><PageHeader title="Patrimônio e manutenção" description="Ativos, calibrações, ordens de serviço e documentos" icon={<Wrench />} /><Card className="h-40 animate-pulse rounded-2xl" /></main>;
  if (query.error) return <ErrorState title="Não foi possível carregar o patrimônio" description="Nenhuma alteração será feita até confirmar o estado atual dos equipamentos." error={query.error} onRetry={() => void query.refetch()} />;

  const indicadores: { key: Indicador; icon: typeof Wrench; label: string; value: number; caption: string; color: string; surface: string; escuro: boolean }[] = [
    { key: 'vencida', icon: AlertTriangle, label: 'Manutenção vencida', value: stats.vencida, caption: 'calibração ou ordem atrasada', color: 'text-white', surface: 'bg-white/15', escuro: true },
    { key: 'em30', icon: CalendarClock, label: 'Vence em 30 dias', value: stats.em30, caption: 'programar com antecedência', color: 'text-warning', surface: 'bg-warning/10', escuro: false },
    { key: 'manutencao', icon: Wrench, label: 'Em manutenção', value: stats.manutencao, caption: `${plural(stats.ordensAbertas, 'ordem aberta', 'ordens abertas')}${stats.indisponivel > 0 ? ` · ${stats.indisponivel} indisponível` : ''}`, color: 'text-[#1080CA]', surface: 'bg-[#1080CA]/10', escuro: false },
    { key: 'operacional', icon: CheckCircle2, label: 'Operacionais', value: stats.operacional, caption: `${totalAtivos} no total`, color: 'text-success', surface: 'bg-success/10', escuro: false },
  ];

  return <main className="space-y-6">
    <PageHeader
      title="Patrimônio e manutenção"
      description={descricao}
      icon={<Wrench />}
      actions={<>
        <Button asChild variant="outline" className="shrink-0 gap-2 rounded-full">
          <Link to="/gestao-fluxo"><DoorOpen aria-hidden="true" className="h-4 w-4" /> Salas</Link>
        </Button>
        {data.canOpenOrders && <Button variant="outline" className="shrink-0 gap-2 rounded-full" aria-expanded={showOrderForm} aria-controls="equipment-order-form" onClick={() => showOrderForm ? setShowOrderForm(false) : abrirOrdemPara()}>
          <ClipboardList aria-hidden="true" className="h-4 w-4" /> Abrir ordem de serviço
        </Button>}
        <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Atualizar patrimônio" title="Atualizar patrimônio">
          <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} />
        </Button>
        {data.canManageAssets && <Button className="shrink-0 gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" aria-expanded={showAssetForm} aria-controls="equipment-asset-form" onClick={() => showAssetForm ? setShowAssetForm(false) : abrirCadastro()}>
          <Plus className="h-4 w-4" /> Novo equipamento
        </Button>}
      </>}
    />

    <section role="group" aria-label="Situação do patrimônio" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Situação agora</h2>
        <p className="text-xs text-muted-foreground">{indicador === 'todos' ? 'Clique em um indicador para filtrar os equipamentos.' : `Mostrando apenas ${INDICADOR_LABEL[indicador]}.`}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {indicadores.map((item) => {
          const Icon = item.icon;
          const ativo = indicador === item.key;
          return <button key={item.key} type="button" aria-pressed={ativo} onClick={() => setIndicador(ativo ? 'todos' : item.key)}
            className={cn('rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
              item.escuro && 'border-transparent bg-gradient-primary text-white', ativo && !item.escuro && 'border-[#1080CA]/50 ring-1 ring-[#1080CA]/30', ativo && item.escuro && 'ring-2 ring-[#1080CA]/60')}>
            <div className="flex min-h-[96px] items-center gap-3 p-3">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', item.surface)}><Icon aria-hidden="true" className={cn('h-5 w-5', item.color)} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className={cn('truncate text-xs font-semibold', item.escuro ? 'text-white/80' : 'text-foreground')}>{item.label}</h3>
                  <span className={cn('text-2xl font-bold tabular-nums', item.color)}>{item.value}</span>
                </div>
                <p className={cn('truncate text-[11px]', item.escuro ? 'text-white/60' : 'text-muted-foreground')}>{item.caption}</p>
              </div>
            </div>
          </button>;
        })}
      </div>
    </section>

    {proximaManutencao && (() => {
      const prazo = prazoDe(proximaManutencao);
      const sala = roomNames.get(proximaManutencao.room_id || '');
      const dias = prazo.dias ?? 0;
      return <Card className="overflow-hidden rounded-2xl border-[#1080CA]/30 shadow-[0_8px_24px_rgba(16,128,202,0.12)]">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><CalendarClock className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1080CA]">Próxima manutenção</p>
              <h2 className="truncate text-lg font-bold text-foreground">{proximaManutencao.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{CATEGORIES[proximaManutencao.category]}{proximaManutencao.asset_tag ? ` · ${proximaManutencao.asset_tag}` : ''}</span>
                {sala && <Link to="/gestao-fluxo" className="inline-flex items-center gap-1 font-medium text-[#1080CA] underline-offset-2 hover:underline"><DoorOpen aria-hidden="true" className="h-3 w-3" />{sala}</Link>}
                <span>{prazo.origem === 'ordem' ? 'Ordem de serviço' : 'Calibração'} em {fmt(prazo.date)}</span>
                <span className={cn('inline-flex items-center gap-1 font-medium', dias < 0 ? 'text-destructive' : dias <= 30 ? 'text-warning-foreground' : '')}>
                  {dias < 0 ? `vencida há ${plural(Math.abs(dias), 'dia', 'dias')}` : dias === 0 ? 'vence hoje' : `em ${plural(dias, 'dia', 'dias')}`}
                </span>
                <Badge variant="outline" className={cn('rounded-full text-[10px]', STATUS_BADGE[proximaManutencao.status])}>{STATUSES[proximaManutencao.status]}</Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {data.canOpenOrders && <Button className="h-10 gap-1.5 rounded-full bg-gradient-primary text-white hover:brightness-110" onClick={() => abrirOrdemPara(proximaManutencao.id, prazo.origem === 'calibracao' ? 'calibration' : undefined)}>
              <ClipboardList aria-hidden="true" className="h-4 w-4" /> Abrir ordem
            </Button>}
            {data.canMaintain && proximaManutencao.status === 'active' && <Button variant="outline" className="h-10 gap-1.5 rounded-full" disabled={operation.isPending} onClick={() => patchAsset(proximaManutencao, { status: 'maintenance' })}>
              <Wrench aria-hidden="true" className="h-4 w-4" /> Enviar para manutenção
            </Button>}
          </div>
        </CardContent>
      </Card>;
    })()}

    {data.canManageAssets && showAssetForm && <div ref={assetFormRef} id="equipment-asset-form"><Card className="rounded-2xl border-border/60 shadow-xs"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">Cadastrar ativo da clínica</CardTitle><CardDescription>Cadastro geral de patrimônio. Analisadores permanecem cadastrados no painel do laboratório.</CardDescription></div><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" aria-label="Fechar cadastro" onClick={() => setShowAssetForm(false)}><X className="h-4 w-4" /></Button></div></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => { event.preventDefault(); createAsset.mutate(); }}>
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
      <div className="flex items-end"><Button type="submit" className="rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" disabled={createAsset.isPending || !assetForm.name.trim()}>{createAsset.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Cadastrar ativo</Button></div>
    </form></CardContent></Card></div>}

    {data.canOpenOrders && showOrderForm && <div ref={orderFormRef} id="equipment-order-form"><Card className="rounded-2xl border-border/60 shadow-xs"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">Abrir ordem de serviço</CardTitle><CardDescription>Registre manutenção preventiva, corretiva, inspeção ou calibração com prazo e responsável. A equipe autorizada atualiza e conclui a ordem.</CardDescription></div><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" aria-label="Fechar ordem de serviço" onClick={() => setShowOrderForm(false)}><X className="h-4 w-4" /></Button></div></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => { event.preventDefault(); createOrder.mutate(); }}>
      <div className="space-y-1"><Label>Equipamento *</Label><Select value={orderForm.asset_id} onValueChange={(asset_id) => setOrderForm({ ...orderForm, asset_id })}><SelectTrigger aria-label="Equipamento da ordem"><SelectValue placeholder="Selecionar ativo" /></SelectTrigger><SelectContent>{data.assets.filter((asset) => asset.status !== 'retired').map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.name}{asset.asset_tag ? ` · ${asset.asset_tag}` : ''}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Tipo</Label><Select value={orderForm.kind} onValueChange={(kind) => setOrderForm({ ...orderForm, kind })}><SelectTrigger aria-label="Tipo de ordem"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ORDER_KINDS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Título *</Label><Input aria-label="Título da ordem *" required minLength={3} maxLength={160} value={orderForm.title} onChange={(event) => setOrderForm({ ...orderForm, title: event.target.value })} /></div>
      <div className="space-y-1"><Label>Prioridade</Label><Select value={orderForm.priority} onValueChange={(priority) => setOrderForm({ ...orderForm, priority })}><SelectTrigger aria-label="Prioridade da ordem"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PRIORIDADES).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Prazo</Label><Input type="date" value={orderForm.due_on} onChange={(event) => setOrderForm({ ...orderForm, due_on: event.target.value })} /></div>
      <div className="space-y-1"><Label>Responsável</Label><Select value={orderForm.assigned_to || '__none__'} onValueChange={(assigned_to) => setOrderForm({ ...orderForm, assigned_to: assigned_to === '__none__' ? '' : assigned_to })}><SelectTrigger aria-label="Responsável pela ordem"><SelectValue placeholder="A definir" /></SelectTrigger><SelectContent><SelectItem value="__none__">A definir</SelectItem>{data.profiles.map((person) => <SelectItem key={person.id} value={person.id}>{person.nome}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1 sm:col-span-2"><Label>Descrição</Label><Textarea maxLength={2000} rows={2} value={orderForm.description} onChange={(event) => setOrderForm({ ...orderForm, description: event.target.value })} /></div>
      <div className="flex items-end"><Button type="submit" className="rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" disabled={createOrder.isPending || !orderForm.asset_id || orderForm.title.trim().length < 3}>{createOrder.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Abrir ordem</Button></div>
    </form></CardContent></Card></div>}

    <section className="space-y-3" aria-labelledby="equipment-list-heading">
      <h2 id="equipment-list-heading" className="text-xl font-semibold">Ativos cadastrados</h2>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar equipamentos" className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]" placeholder="Nome, patrimônio, sala, série..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger aria-label="Filtrar por categoria" className="h-10 w-full rounded-full sm:w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent><SelectItem value="todas">Todas as categorias</SelectItem>{Object.entries(CATEGORIES).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
        </Select>
        <div role="group" aria-label="Filtrar por status" className="flex flex-wrap items-center gap-1.5">
          {([['todos', 'Todos'], ...Object.entries(STATUSES)] as [typeof statusFilter, string][]).map(([key, label]) => {
            const ativo = statusFilter === key;
            return <button key={key} type="button" aria-pressed={ativo} onClick={() => setStatusFilter(key)}
              className={cn('h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]', ativo ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-border bg-card text-muted-foreground hover:border-[#9CC7EC] hover:text-foreground')}>{label}</button>;
          })}
        </div>
        {temFiltro && <Button variant="ghost" size="sm" className="h-10 gap-1.5 rounded-full text-muted-foreground" onClick={limparFiltros}><X aria-hidden="true" className="h-3.5 w-3.5" /> Limpar filtros</Button>}
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">{filtrados.length} de {plural(totalAtivos, 'equipamento', 'equipamentos')}</p>
      </div>

      {filtrados.length === 0 ? <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="py-16 text-center text-muted-foreground">
        <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><Package className="h-7 w-7" /></span>
        <p className="font-medium text-foreground">{totalAtivos === 0 ? 'Nenhum ativo patrimonial cadastrado' : 'Nenhum equipamento corresponde aos filtros'}</p>
        <p className="mt-1 text-sm">{totalAtivos === 0 ? 'Cadastre o primeiro equipamento para acompanhar calibrações e ordens de serviço. Os equipamentos dos setores laboratoriais continuam na gestão do laboratório.' : 'Limpe a busca, a categoria, o status ou o indicador para ver todos os equipamentos.'}</p>
        {totalAtivos === 0
          ? (data.canManageAssets && <Button className="mt-4 rounded-full bg-gradient-primary text-white hover:brightness-110" size="sm" onClick={abrirCadastro}><Plus className="mr-1.5 h-4 w-4" />Novo equipamento</Button>)
          : <Button className="mt-4 rounded-full" size="sm" variant="outline" onClick={limparFiltros}>Limpar filtros</Button>}
      </CardContent></Card>
      : porCategoria.map(([categoria, ativos]) => <section key={categoria} aria-labelledby={`equipment-cat-${categoria}`} className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm"><Package className="h-4 w-4" /></span>
          <h3 id={`equipment-cat-${categoria}`} className="text-base font-semibold text-foreground">{CATEGORIES[categoria] || categoria}</h3>
          <Badge variant="outline" className="h-5 rounded-full border-[#BFD8EE] bg-white text-xs tabular-nums text-[#1080CA]">{ativos.length}</Badge>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">{ativos.map((asset) => {
          const orders = ordersByAsset.get(asset.id) ?? [];
          const docs = documentsByAsset.get(asset.id) ?? [];
          const prazo = prazoDe(asset);
          const sala = roomNames.get(asset.room_id || '');
          const podeAgir = data.canMaintain && asset.status !== 'retired';
          const calibrationExpired = Boolean(asset.calibration_due && asset.calibration_due.slice(0, 10) < hoje);
          const dueSoon = Boolean(asset.calibration_due && !calibrationExpired && diasEntre(hoje, asset.calibration_due) <= 30);
          return <Card key={asset.id} className={cn('overflow-hidden rounded-2xl border-border/60 shadow-xs transition-all duration-200',
            prazo.urgencia === 'vencida' && 'border-destructive/30 shadow-[0_8px_24px_rgba(239,68,68,0.10)]',
            prazo.urgencia === 'em30' && 'border-warning/40',
            proximaManutencao?.id === asset.id && 'ring-1 ring-[#1080CA]/30')}>
            <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="flex flex-wrap items-center gap-1.5 text-base"><span className="truncate">{asset.name}</span>{proximaManutencao?.id === asset.id && <Badge className="rounded-full border-transparent bg-gradient-primary text-[9px] text-white hover:bg-gradient-primary">Próxima</Badge>}</CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-x-1.5">
                  <span>{CATEGORIES[asset.category]}</span>
                  <span aria-hidden="true">·</span>
                  {sala ? <Link to="/gestao-fluxo" className="inline-flex items-center gap-1 font-medium text-[#1080CA] underline-offset-2 hover:underline" title="Ver em Salas e leitos"><DoorOpen aria-hidden="true" className="h-3 w-3" />{sala}</Link> : <span>Sem sala fixa</span>}
                  {asset.asset_tag && <><span aria-hidden="true">·</span><span>{asset.asset_tag}</span></>}
                </CardDescription>
              </div>
              <Badge variant="outline" className={cn('shrink-0 rounded-full', STATUS_BADGE[asset.status])}>{STATUSES[asset.status]}</Badge>
            </div></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-muted-foreground"><p>Série: {asset.serial_number || '—'}</p><p>Modelo: {asset.model || '—'}</p><p>Responsável: {profilesById.get(asset.responsible_user_id || '') || 'A definir'}</p><p>Garantia: {fmt(asset.warranty_until)}</p><p className={cn(dueSoon && 'font-medium text-warning-foreground', calibrationExpired && 'font-medium text-destructive')}><CalendarClock aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />Calibração: {fmt(asset.calibration_due)} {calibrationExpired ? <span className="text-destructive">· vencida</span> : dueSoon && '· vence em breve'}</p><p>Manutenção: {asset.maintenance_interval_days ? `a cada ${asset.maintenance_interval_days} dias` : 'sem periodicidade'}</p></div>
              {asset.block_room_when_unavailable && <p className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 p-2 text-warning-foreground"><ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />A sala fica bloqueada se este equipamento estiver fora de operação.</p>}
              {(podeAgir || (data.canOpenOrders && asset.status !== 'retired')) && <div className="flex flex-wrap gap-2">
                {podeAgir && asset.status !== 'active' && <Button size="sm" className="h-9 rounded-full bg-gradient-primary text-xs text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110" disabled={operation.isPending} onClick={() => patchAsset(asset, { status: 'active' })}>Marcar em operação</Button>}
                {podeAgir && asset.status === 'active' && <><Button size="sm" className="h-9 rounded-full bg-gradient-primary text-xs text-white hover:brightness-110" disabled={operation.isPending} onClick={() => patchAsset(asset, { status: 'maintenance' })}>Enviar para manutenção</Button><Button size="sm" variant="outline" className="h-9 rounded-full text-xs" disabled={operation.isPending} onClick={() => patchAsset(asset, { status: 'unavailable' })}>Marcar indisponível</Button></>}
                {data.canOpenOrders && asset.status !== 'retired' && <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-full text-xs" onClick={() => abrirOrdemPara(asset.id)}><ClipboardList aria-hidden="true" className="h-3.5 w-3.5" />Abrir OS</Button>}
                {podeAgir && data.canManageAssets && <Button size="sm" variant="ghost" className="h-9 rounded-full text-xs text-destructive hover:text-destructive" disabled={operation.isPending} onClick={() => patchAsset(asset, { status: 'retired' })}>Aposentar</Button>}
              </div>}
              {podeAgir && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const date = calibrationDates[asset.id] ?? asset.calibration_due ?? ''; patchAsset(asset, { calibration_due: date || null }); }}><div className="space-y-1"><Label htmlFor={`calibration-${asset.id}`}>Próxima calibração</Label><Input id={`calibration-${asset.id}`} className="h-9 rounded-full" type="date" value={calibrationDates[asset.id] ?? asset.calibration_due ?? ''} onChange={(event) => setCalibrationDates({ ...calibrationDates, [asset.id]: event.target.value })} /></div><Button size="sm" type="submit" variant="outline" className="h-9 rounded-full text-xs" disabled={operation.isPending}>Atualizar prazo</Button></form>}
              {docs.length > 0 && <div className="space-y-1"><p className="font-medium">Documentos</p>{docs.map((doc) => <div key={doc.id} className="flex items-center justify-between gap-2"><span className="truncate">{doc.file_name} · {(doc.byte_size / 1024).toFixed(0)} KB</span><Button size="sm" variant="link" className="h-auto p-0 text-[#1080CA]" onClick={() => void openDocument(doc.id)}>Abrir</Button></div>)}</div>}
              {podeAgir && <Label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs hover:border-[#9CC7EC]"><FileUp aria-hidden="true" className="h-4 w-4" />Anexar PDF ou imagem<input className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(asset, file); event.currentTarget.value = ''; }} /></Label>}
              {orders.length > 0 && <div className="space-y-2 border-t pt-3"><p className="font-medium">Ordens de serviço</p>{orders.slice(0, 5).map((order) => {
                const atrasada = Boolean(order.due_on && (order.status === 'open' || order.status === 'in_progress') && order.due_on.slice(0, 10) < hoje);
                return <div key={order.id} className={cn('rounded-xl border border-border/60 p-3', atrasada && 'border-destructive/30 bg-destructive/5')}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{order.title} · {ORDER_KINDS[order.kind]}</span><Badge variant="outline" className={cn('rounded-full', ORDER_BADGE[order.status])}>{ORDER_STATUS[order.status]}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{PRIORIDADES[order.priority] ?? order.priority.toUpperCase()} · prazo <span className={cn(atrasada && 'font-medium text-destructive')}>{fmt(order.due_on)}{atrasada && ' (atrasada)'}</span> · {profilesById.get(order.assigned_to || '') || 'Sem responsável'}</p>{order.description && <p className="mt-1 text-xs">{order.description}</p>}{order.status === 'open' && data.canMaintain && <Button size="sm" className="mt-2 h-9 rounded-full bg-gradient-primary text-xs text-white hover:brightness-110" disabled={operation.isPending} onClick={() => operation.mutate({ action: 'update_order', work_order_id: order.id, expected_updated_at: order.updated_at, patch: { status: 'in_progress' } })}>Iniciar serviço</Button>}{order.status === 'in_progress' && data.canMaintain && <div className="mt-2 flex gap-2"><Input className="h-9 rounded-full" aria-label={`Serviço executado em ${order.title}`} placeholder="Serviço executado *" maxLength={2000} value={completionNotes[order.id] || ''} onChange={(event) => setCompletionNotes({ ...completionNotes, [order.id]: event.target.value })} /><Button size="sm" className="h-9 rounded-full bg-gradient-primary text-xs text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110" disabled={(completionNotes[order.id] || '').trim().length < 3 || operation.isPending} onClick={() => operation.mutate({ action: 'update_order', work_order_id: order.id, expected_updated_at: order.updated_at, patch: { status: 'completed', completion_note: completionNotes[order.id] } })}>Concluir</Button></div>}{order.completion_note && <p className="mt-1 rounded-lg bg-muted p-2 text-xs">Concluído: {order.completion_note}</p>}</div>;
              })}</div>}
            </CardContent>
          </Card>;
        })}</div>
      </section>)}
    </section>

    <section className="space-y-3" aria-labelledby="equipment-history-heading">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm"><History className="h-4 w-4" /></span>
        <h2 id="equipment-history-heading" className="text-base font-semibold text-foreground">Histórico de auditoria</h2>
        {data.audit.length > 0 && <Badge variant="outline" className="h-5 rounded-full border-[#BFD8EE] bg-white text-xs tabular-nums text-[#1080CA]">{Math.min(data.audit.length, 25)}</Badge>}
      </div>
      {data.audit.length === 0
        ? <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="p-5 text-sm text-muted-foreground">Cadastros, alterações, ordens e documentos serão registrados aqui.</CardContent></Card>
        : <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="divide-y divide-border/60 p-0">{data.audit.slice(0, 25).map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span>{event.action.replace(/_/g, ' ')} · {event.asset_id ? assetById.get(event.asset_id)?.name || 'Ativo arquivado' : event.work_order_id ? 'Ordem de serviço' : 'Documento'}</span><span className="text-muted-foreground">{profilesById.get(event.actor_id || '') || 'Equipe'} · {new Date(event.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></div>)}</CardContent></Card>}
    </section>
  </main>;
}
