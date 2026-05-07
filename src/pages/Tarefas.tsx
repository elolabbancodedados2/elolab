import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  ListTodo, Plus, CheckCircle2, Clock, AlertTriangle, Circle, Search, Trash2,
  Loader2, CalendarClock, User2, LayoutGrid, LayoutList, GripVertical,
} from 'lucide-react';

// ─── Config ────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; icon: typeof Circle; colorClasses: string }> = {
  pendente: { label: 'Pendente', icon: Circle, colorClasses: 'bg-warning/10 text-warning border-warning/20' },
  em_andamento: { label: 'Em Andamento', icon: Clock, colorClasses: 'bg-info/10 text-info border-info/20' },
  concluida: { label: 'Concluída', icon: CheckCircle2, colorClasses: 'bg-success/10 text-success border-success/20' },
  cancelada: { label: 'Cancelada', icon: AlertTriangle, colorClasses: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const prioridadeConfig: Record<string, { label: string; colorClasses: string; dot: string }> = {
  baixa: { label: 'Baixa', colorClasses: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  media: { label: 'Média', colorClasses: 'bg-info/10 text-info', dot: 'bg-info' },
  alta: { label: 'Alta', colorClasses: 'bg-warning/10 text-warning', dot: 'bg-warning' },
  urgente: { label: 'Urgente', colorClasses: 'bg-destructive/10 text-destructive', dot: 'bg-destructive animate-pulse' },
};

const kanbanColumns = [
  { key: 'pendente', label: 'Pendente', icon: Circle, color: 'text-warning', borderColor: 'border-warning/30', bg: 'bg-warning/5' },
  { key: 'em_andamento', label: 'Em Andamento', icon: Clock, color: 'text-info', borderColor: 'border-info/30', bg: 'bg-info/5' },
  { key: 'concluida', label: 'Concluída', icon: CheckCircle2, color: 'text-success', borderColor: 'border-success/30', bg: 'bg-success/5' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };

// ─── Kanban Card (compact) ─────────────────────────────────
function KanbanCard({ tarefa, onUpdate, onDelete, onDragStart }: {
  tarefa: any;
  onUpdate: (data: any) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
}) {
  const pc = prioridadeConfig[tarefa.prioridade] || prioridadeConfig.media;
  const vencida = tarefa.data_vencimento && isPast(new Date(tarefa.data_vencimento)) && tarefa.status !== 'concluida';
  const hoje = tarefa.data_vencimento && isToday(new Date(tarefa.data_vencimento));

  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
      <div
        draggable
        onDragStart={(e) => onDragStart(e, tarefa.id)}
        className={cn(
          'group rounded-xl border bg-card p-3 cursor-grab active:cursor-grabbing transition-all hover:shadow-md hover:-translate-y-0.5',
          vencida && 'border-destructive/40',
          hoje && 'border-warning/40',
          tarefa.status === 'concluida' && 'opacity-60',
        )}
      >
        <div className="flex items-start gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground/30 mt-0.5 shrink-0 group-hover:text-muted-foreground/60 transition-colors" />
          <div className="flex-1 min-w-0">
            <p className={cn('text-sm font-semibold leading-snug', tarefa.status === 'concluida' && 'line-through text-muted-foreground')}>
              {tarefa.titulo}
            </p>
            {tarefa.descricao && (
              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">{tarefa.descricao}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <div className="flex items-center gap-1">
                <span className={cn('h-1.5 w-1.5 rounded-full', pc.dot)} />
                <span className="text-[10px] text-muted-foreground">{pc.label}</span>
              </div>
              {tarefa.categoria && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">{tarefa.categoria}</Badge>
              )}
              {tarefa.responsavel?.nome && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <User2 className="h-2.5 w-2.5" /> {tarefa.responsavel.nome.split(' ')[0]}
                </span>
              )}
            </div>
            {tarefa.data_vencimento && (
              <p className={cn(
                'text-[10px] mt-1.5 flex items-center gap-1',
                vencida ? 'text-destructive font-semibold' : hoje ? 'text-warning font-semibold' : 'text-muted-foreground',
              )}>
                <CalendarClock className="h-2.5 w-2.5" />
                {format(new Date(tarefa.data_vencimento), 'dd/MM', { locale: ptBR })}
                {vencida && ' · vencida'}
                {hoje && ' · hoje'}
              </p>
            )}
          </div>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive shrink-0" onClick={() => onDelete(tarefa.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Task Card (list view) ─────────────────────────────────
function TarefaCard({ tarefa, onUpdate, onDelete }: {
  tarefa: any;
  onUpdate: (data: any) => void;
  onDelete: (id: string) => void;
}) {
  const sc = statusConfig[tarefa.status] || statusConfig.pendente;
  const pc = prioridadeConfig[tarefa.prioridade] || prioridadeConfig.media;
  const vencida = tarefa.data_vencimento && isPast(new Date(tarefa.data_vencimento)) && tarefa.status !== 'concluida' && tarefa.status !== 'cancelada';
  const hoje = tarefa.data_vencimento && isToday(new Date(tarefa.data_vencimento));
  const StatusIcon = sc.icon;

  return (
    <motion.div variants={fadeUp} layout>
      <Card className={cn(
        'group transition-all duration-200 hover:shadow-md hover:-translate-y-0.5',
        vencida && 'border-destructive/40 shadow-destructive/5',
        hoje && 'border-warning/40 shadow-warning/5',
        tarefa.status === 'concluida' && 'opacity-60',
      )}>
        <CardContent className="py-4 px-5">
          <div className="flex items-start gap-3">
            <button
              onClick={() => {
                if (tarefa.status === 'pendente') onUpdate({ id: tarefa.id, status: 'em_andamento' });
                else if (tarefa.status === 'em_andamento') onUpdate({ id: tarefa.id, status: 'concluida' });
              }}
              className={cn(
                'mt-0.5 h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                tarefa.status === 'concluida'
                  ? 'bg-success border-success text-success-foreground'
                  : 'border-border hover:border-primary hover:bg-primary/5',
              )}
            >
              {tarefa.status === 'concluida' && <CheckCircle2 className="h-3.5 w-3.5" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={cn('font-semibold text-sm', tarefa.status === 'concluida' && 'line-through text-muted-foreground')}>
                  {tarefa.titulo}
                </span>
                <div className="flex items-center gap-1">
                  <span className={cn('h-1.5 w-1.5 rounded-full', pc.dot)} />
                  <span className="text-[10px] text-muted-foreground">{pc.label}</span>
                </div>
              </div>
              {tarefa.descricao && (
                <p className="text-xs text-muted-foreground line-clamp-1 mb-1.5">{tarefa.descricao}</p>
              )}
              <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
                <Badge className={cn('text-[10px] border h-5', sc.colorClasses)}>
                  <StatusIcon className="h-2.5 w-2.5 mr-1" />{sc.label}
                </Badge>
                {tarefa.categoria && <Badge variant="outline" className="text-[10px] h-5">{tarefa.categoria}</Badge>}
                {tarefa.responsavel?.nome && (
                  <span className="flex items-center gap-1"><User2 className="h-3 w-3" />{tarefa.responsavel.nome}</span>
                )}
                {tarefa.data_vencimento && (
                  <span className={cn('flex items-center gap-1', vencida && 'text-destructive font-semibold', hoje && 'text-warning font-semibold')}>
                    <CalendarClock className="h-3 w-3" />
                    {format(new Date(tarefa.data_vencimento), 'dd/MM/yyyy', { locale: ptBR })}
                    {vencida && ' (vencida)'}{hoje && ' (hoje)'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {tarefa.status === 'pendente' && (
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => onUpdate({ id: tarefa.id, status: 'em_andamento' })}>
                  <Clock className="h-3 w-3" /> Iniciar
                </Button>
              )}
              {tarefa.status === 'em_andamento' && (
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-success" onClick={() => onUpdate({ id: tarefa.id, status: 'concluida' })}>
                  <CheckCircle2 className="h-3 w-3" /> Concluir
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => onDelete(tarefa.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function Tarefas() {
  const { user, profile } = useSupabaseAuth();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: profiles } = useQuery({
    queryKey: ['profiles-tarefas'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, nome').order('nome');
      return data || [];
    },
  });

  const { data: tarefas, isLoading } = useQuery({
    queryKey: ['tarefas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tarefas')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        if (import.meta.env.DEV) console.error('Erro ao buscar tarefas:', error);
        toast.error('Erro ao carregar tarefas: ' + error.message);
        throw error;
      }
      if (import.meta.env.DEV) console.log('Tarefas carregadas:', data?.length || 0);
      return data || [];
    },
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });

  const createTarefa = useMutation({
    mutationFn: async (form: any) => {
      const { error } = await supabase.from('tarefas').insert({ ...form, criado_por: user?.id, clinica_id: profile?.clinica_id || null });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarefas'] });
      toast.success('Tarefa criada!');
      setShowNew(false);
    },
    onError: (err: any) => {
      if (import.meta.env.DEV) console.error('Erro ao criar tarefa:', err);
      toast.error('Erro ao criar tarefa: ' + (err?.message || 'Erro desconhecido'));
    },
  });

  const updateTarefa = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      if (updates.status === 'concluida') updates.data_conclusao = new Date().toISOString();
      const { error } = await supabase.from('tarefas').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarefas'] });
      toast.success('Tarefa atualizada');
    },
  });

  const deleteTarefa = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('tarefas').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Sem permissão para excluir esta tarefa.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarefas'] });
      toast.success('Tarefa removida');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover tarefa'),
  });

  // Enrich tarefas with profile names (since we removed the join)
  const enrichedTarefas = useMemo(() => {
    return tarefas?.map((t: any) => ({
      ...t,
      responsavel: t.responsavel_id ? { nome: profiles?.find((p: any) => p.id === t.responsavel_id)?.nome || '' } : null,
      criador: t.criado_por ? { nome: profiles?.find((p: any) => p.id === t.criado_por)?.nome || '' } : null,
    })) || [];
  }, [tarefas, profiles]);

  const filtered = useMemo(() => {
    return enrichedTarefas.filter((t: any) => {
      const matchSearch = !search || t.titulo.toLowerCase().includes(search.toLowerCase()) ||
        (t.descricao && t.descricao.toLowerCase().includes(search.toLowerCase()));
      const matchStatus = filterStatus === 'all' || t.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [enrichedTarefas, search, filterStatus]);

  const stats = useMemo(() => ({
    total: enrichedTarefas.length,
    pendentes: enrichedTarefas.filter((t: any) => t.status === 'pendente').length,
    emAndamento: enrichedTarefas.filter((t: any) => t.status === 'em_andamento').length,
    concluidas: enrichedTarefas.filter((t: any) => t.status === 'concluida').length,
    vencidas: enrichedTarefas.filter((t: any) => t.data_vencimento && isPast(new Date(t.data_vencimento)) && t.status !== 'concluida' && t.status !== 'cancelada').length,
  }), [enrichedTarefas]);

  const [form, setForm] = useState({
    titulo: '', descricao: '', prioridade: 'media', responsavel_id: '',
    data_vencimento: '', categoria: '',
  });

  // ─── Drag & Drop Handlers ───────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    const task = enrichedTarefas.find((t: Record<string, unknown>) => t.id === taskId);
    if (task && task.status !== newStatus) {
      updateTarefa.mutate({ id: taskId, status: newStatus });
    }
    setDraggedTaskId(null);
  }, [enrichedTarefas, updateTarefa]);

  const handleDragEnd = useCallback(() => {
    setDraggedTaskId(null);
  }, []);

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <ListTodo className="h-6 w-6 text-primary" /> Tarefas Internas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie e acompanhe tarefas da equipe</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm" className="h-8 gap-1.5 rounded-none border-0 text-xs"
              onClick={() => setViewMode('kanban')}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm" className="h-8 gap-1.5 rounded-none border-0 border-l text-xs"
              onClick={() => setViewMode('list')}
            >
              <LayoutList className="h-3.5 w-3.5" /> Lista
            </Button>
          </div>
          <Button onClick={() => setShowNew(true)} className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" /> Nova Tarefa
          </Button>
        </div>
      </div>

      {/* Stats */}
      <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, icon: ListTodo, color: 'text-primary', bg: 'bg-primary/10', filter: 'all' },
          { label: 'Pendentes', value: stats.pendentes, icon: Circle, color: 'text-warning', bg: 'bg-warning/10', filter: 'pendente' },
          { label: 'Em Andamento', value: stats.emAndamento, icon: Clock, color: 'text-info', bg: 'bg-info/10', filter: 'em_andamento' },
          { label: 'Concluídas', value: stats.concluidas, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', filter: 'concluida' },
          { label: 'Vencidas', value: stats.vencidas, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', filter: 'all' },
        ].map((s, i) => (
          <motion.div key={s.label} variants={fadeUp} custom={i}>
            <button
              onClick={() => s.filter !== 'all' ? setFilterStatus(s.filter) : setFilterStatus('all')}
              className={cn(
                'w-full rounded-xl border bg-card px-4 py-3 flex items-center gap-3 transition-all hover:shadow-md hover:-translate-y-0.5 text-left',
                filterStatus === s.filter && s.filter !== 'all' && 'ring-2 ring-primary/30 shadow-md',
              )}
            >
              <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
                <s.icon className={cn('h-5 w-5', s.color)} />
              </div>
              <div>
                <p className={cn('text-xl font-bold tabular-nums', s.color)}>{s.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium">{s.label}</p>
              </div>
            </button>
          </motion.div>
        ))}
      </motion.div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar tarefas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        {viewMode === 'list' && (
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {filterStatus !== 'all' && viewMode === 'list' && (
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setFilterStatus('all')}>
            Limpar filtro
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="py-4 px-5">
              <div className="flex gap-3">
                <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            </CardContent></Card>
          ))}
        </div>
      ) : viewMode === 'kanban' ? (
        /* ─── Kanban View ─── */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {kanbanColumns.map(col => {
            const colTasks = enrichedTarefas.filter((t: any) => {
              const matchSearch = !search || t.titulo.toLowerCase().includes(search.toLowerCase()) ||
                (t.descricao && t.descricao.toLowerCase().includes(search.toLowerCase()));
              return t.status === col.key && matchSearch;
            });
            const ColIcon = col.icon;
            return (
              <div
                key={col.key}
                className={cn('rounded-2xl border-2 border-dashed p-3 min-h-[400px] transition-colors', col.borderColor, col.bg)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.key)}
              >
                <div className="flex items-center gap-2 mb-3 px-1">
                  <ColIcon className={cn('h-4 w-4', col.color)} />
                  <h3 className={cn('text-sm font-bold', col.color)}>{col.label}</h3>
                  <Badge variant="outline" className="ml-auto text-[10px] h-5">{colTasks.length}</Badge>
                </div>
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {colTasks.map((t: any) => (
                      <KanbanCard
                        key={t.id}
                        tarefa={t}
                        onUpdate={(data) => updateTarefa.mutate(data)}
                        onDelete={(id) => {
                          setDeleteTaskId(id);
                        }}
                        onDragStart={handleDragStart}
                      />
                    ))}
                  </AnimatePresence>
                  {colTasks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
                      <ColIcon className="h-8 w-8 mb-2" />
                      <p className="text-xs">Nenhuma tarefa</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : filtered.length === 0 ? (
        /* ─── Empty List ─── */
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <ListTodo className="h-14 w-14 text-muted-foreground/20 mb-4" />
              <p className="font-semibold text-lg">Nenhuma tarefa encontrada</p>
              <p className="text-sm text-muted-foreground mt-1 mb-6">
                {search || filterStatus !== 'all' ? 'Tente ajustar os filtros' : 'Crie sua primeira tarefa'}
              </p>
              <Button onClick={() => setShowNew(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Nova Tarefa
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        /* ─── List View ─── */
        <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filtered.map((t: any) => (
              <TarefaCard
                key={t.id}
                tarefa={t}
                onUpdate={(data) => updateTarefa.mutate(data)}
                onDelete={(id) => {
                  setDeleteTaskId(id);
                }}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Dialog Nova Tarefa */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Nova Tarefa
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!form.titulo.trim()) { toast.error('Título é obrigatório'); return; }
            createTarefa.mutate({
              ...form,
              responsavel_id: form.responsavel_id || null,
              data_vencimento: form.data_vencimento || null,
              categoria: form.categoria || null,
            });
            setForm({ titulo: '', descricao: '', prioridade: 'media', responsavel_id: '', data_vencimento: '', categoria: '' });
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input value={form.titulo} onChange={(e) => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="O que precisa ser feito?" autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Detalhes opcionais..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={form.prioridade} onValueChange={(v) => setForm(p => ({ ...p, prioridade: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(prioridadeConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        <span className="flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full', v.dot)} />
                          {v.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input type="date" value={form.data_vencimento} onChange={(e) => setForm(p => ({ ...p, data_vencimento: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Select value={form.responsavel_id} onValueChange={(v) => setForm(p => ({ ...p, responsavel_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{profiles?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm(p => ({ ...p, categoria: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {['Administrativo', 'Clínico', 'Financeiro', 'TI', 'Manutenção', 'RH', 'Outro'].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button type="submit" className="gap-2" disabled={!form.titulo.trim() || createTarefa.isPending}>
                {createTarefa.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar Tarefa
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm delete dialog */}
      <AlertDialog open={!!deleteTaskId} onOpenChange={(open) => !open && setDeleteTaskId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta tarefa será removida permanentemente. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteTaskId) { deleteTarefa.mutate(deleteTaskId); setDeleteTaskId(null); } }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
