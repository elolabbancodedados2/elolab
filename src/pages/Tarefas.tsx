import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Link as RouterLink } from 'react-router-dom';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
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
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  ListTodo, Plus, CheckCircle2, Clock, AlertTriangle, Circle, Search, Trash2,
  Loader2, CalendarClock, User2, LayoutGrid, LayoutList, GripVertical, CircleX, RotateCcw,
} from 'lucide-react';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { normalizarTexto } from '@/lib/buscaPaciente';
import { useRecoverableDraft } from '@/hooks/useRecoverableDraft';
import { DraftRecoveryNotice } from '@/components/DraftRecoveryNotice';
import { withSafeRetry } from '@/lib/retry';
import { ErrorState } from '@/components/ErrorState';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';

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
  { key: 'cancelada', label: 'Cancelada', icon: AlertTriangle, color: 'text-destructive', borderColor: 'border-destructive/30', bg: 'bg-destructive/5' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };

const tarefaVencida = (tarefa: any, hoje: string) =>
  Boolean(tarefa.data_vencimento && tarefa.data_vencimento < hoje && tarefa.status !== 'concluida' && tarefa.status !== 'cancelada');
const tarefaDeHoje = (tarefa: any, hoje: string) => Boolean(tarefa.data_vencimento && tarefa.data_vencimento === hoje);

// ─── Kanban Card (compact) ─────────────────────────────────
function KanbanCard({ tarefa, hoje, onUpdate, onDelete, onDragStart, draggable = true, isDragging = false }: {
  tarefa: any;
  hoje: string;
  onUpdate: (data: any) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  draggable?: boolean;
  isDragging?: boolean;
}) {
  const pc = prioridadeConfig[tarefa.prioridade] || prioridadeConfig.media;
  const vencida = tarefaVencida(tarefa, hoje);
  const venceHoje = tarefaDeHoje(tarefa, hoje);

  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
      <div
        draggable={draggable}
        onDragStart={draggable ? (e) => onDragStart(e, tarefa.id) : undefined}
        className={cn(
          'group rounded-xl border bg-card p-3 transition-all hover:shadow-md hover:-translate-y-0.5',
          draggable && 'cursor-grab active:cursor-grabbing',
          isDragging && 'opacity-50 scale-[0.98]',
          vencida && 'border-destructive/40',
          venceHoje && 'border-warning/40',
          (tarefa.status === 'concluida' || tarefa.status === 'cancelada') && 'opacity-60',
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
            {tarefa.paciente?.nome && (
              <RouterLink
                to={`/pacientes?paciente=${encodeURIComponent(tarefa.paciente_id)}`}
                onClick={(event) => event.stopPropagation()}
                className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs text-primary hover:underline"
              >
                <User2 className="h-3 w-3" /> {tarefa.paciente.nome}
              </RouterLink>
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
                vencida ? 'text-destructive font-semibold' : venceHoje ? 'text-warning font-semibold' : 'text-muted-foreground',
              )}>
                <CalendarClock className="h-2.5 w-2.5" />
                {format(parseDateOnly(tarefa.data_vencimento)!, 'dd/MM', { locale: ptBR })}
                {vencida && ' · vencida'}
                {venceHoje && ' · hoje'}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col">
            {tarefa.status === 'cancelada' ? (
              <Button size="icon" variant="ghost" className="h-11 w-11 p-0 text-primary" onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: 'pendente' })} aria-label={`Reabrir tarefa ${tarefa.titulo}`} title="Reabrir tarefa">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            ) : tarefa.status !== 'concluida' ? (
              <Button size="icon" variant="ghost" className="h-11 w-11 p-0 text-warning opacity-100 md:opacity-0 md:group-hover:opacity-100" onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: 'cancelada' })} aria-label={`Cancelar tarefa ${tarefa.titulo}`} title="Cancelar tarefa">
                <CircleX className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <Button size="icon" variant="ghost" className="h-11 w-11 p-0 text-destructive opacity-100 md:opacity-0 md:group-hover:opacity-100" onClick={() => onDelete(tarefa.id)} aria-label={`Excluir tarefa ${tarefa.titulo}`}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Task Card (list view) ─────────────────────────────────
function TarefaCard({ tarefa, hoje, onUpdate, onDelete, updating }: {
  tarefa: any;
  hoje: string;
  onUpdate: (data: any) => void;
  onDelete: (id: string) => void;
  updating: boolean;
}) {
  const sc = statusConfig[tarefa.status] || statusConfig.pendente;
  const pc = prioridadeConfig[tarefa.prioridade] || prioridadeConfig.media;
  const vencida = tarefaVencida(tarefa, hoje);
  const venceHoje = tarefaDeHoje(tarefa, hoje);
  const StatusIcon = sc.icon;

  return (
    <motion.div variants={fadeUp} layout>
      <Card className={cn(
        'group transition-all duration-200 hover:shadow-md hover:-translate-y-0.5',
        vencida && 'border-destructive/40 shadow-destructive/5',
        venceHoje && 'border-warning/40 shadow-warning/5',
        tarefa.status === 'concluida' && 'opacity-60',
      )}>
        <CardContent className="py-4 px-5">
          <div className="flex items-start gap-3">
            {tarefa.status !== 'concluida' && tarefa.status !== 'cancelada' && <button
              type="button"
              aria-label={tarefa.status === 'pendente' ? 'Iniciar tarefa ' + tarefa.titulo : 'Concluir tarefa ' + tarefa.titulo}
              title={tarefa.status === 'pendente' ? 'Iniciar tarefa' : 'Concluir tarefa'}
              disabled={updating}
              onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: tarefa.status === 'pendente' ? 'em_andamento' : 'concluida' })}
              className={cn(
                'mt-0.5 h-11 w-11 rounded-full border-2 flex items-center justify-center shrink-0 transition-all sm:h-8 sm:w-8',
                'border-border hover:border-primary hover:bg-primary/5 disabled:cursor-wait disabled:opacity-50',
              )}
            >
              {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tarefa.status === 'em_andamento' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
            </button>}
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
                {tarefa.paciente?.nome && (
                  <RouterLink
                    to={`/pacientes?paciente=${encodeURIComponent(tarefa.paciente_id)}`}
                    className="inline-flex min-h-11 items-center gap-1 text-primary hover:underline"
                  >
                    <User2 className="h-3 w-3" /> {tarefa.paciente.nome}
                  </RouterLink>
                )}
                {tarefa.responsavel?.nome && (
                  <span className="flex items-center gap-1"><User2 className="h-3 w-3" />{tarefa.responsavel.nome}</span>
                )}
                {tarefa.data_vencimento && (
                    <span className={cn('flex items-center gap-1', vencida && 'text-destructive font-semibold', venceHoje && 'text-warning font-semibold')}>
                    <CalendarClock className="h-3 w-3" />
                    {format(parseDateOnly(tarefa.data_vencimento)!, 'dd/MM/yyyy', { locale: ptBR })}
                    {vencida && ' (vencida)'}{venceHoje && ' (hoje)'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
              {tarefa.status === 'pendente' && (
                <Button size="sm" variant="ghost" className="h-11 text-xs gap-1" disabled={updating} onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: 'em_andamento' })}>
                  <Clock className="h-3 w-3" /> Iniciar
                </Button>
              )}
              {tarefa.status === 'em_andamento' && (
                <Button size="sm" variant="ghost" className="h-11 text-xs gap-1 text-success" disabled={updating} onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: 'concluida' })}>
                  <CheckCircle2 className="h-3 w-3" /> Concluir
                </Button>
              )}
              {tarefa.status === 'cancelada' ? (
                <Button size="sm" variant="ghost" className="h-11 text-xs gap-1 text-primary" disabled={updating} onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: 'pendente' })}>
                  <RotateCcw className="h-3 w-3" /> Reabrir
                </Button>
              ) : tarefa.status !== 'concluida' ? (
                <Button size="sm" variant="ghost" className="h-11 text-xs gap-1 text-warning" disabled={updating} onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: 'cancelada' })}>
                  <CircleX className="h-3 w-3" /> Cancelar
                </Button>
              ) : null}
              <Button size="icon" variant="ghost" className="h-11 w-11 p-0 text-destructive" onClick={() => onDelete(tarefa.id)} aria-label={`Excluir tarefa ${tarefa.titulo}`}>
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
  const { user, profile, isAdmin, hasRole } = useSupabaseAuth();
  const podeVincularPaciente = isAdmin() || hasRole('recepcao') || hasRole('enfermagem') || hasRole('medico');
  const [agora, setAgora] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const emptyForm = useMemo(() => ({ titulo: '', descricao: '', prioridade: 'media', responsavel_id: '', data_vencimento: '', categoria: '', paciente_id: '' }), []);
  const hoje = todaySaoPauloDateOnly(agora);

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const profilesQuery = useQuery({
    queryKey: ['profiles-tarefas', profile?.clinica_id, profile?.id],
    queryFn: async () => {
      if (!profile?.clinica_id) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, ativo')
        .eq('clinica_id', profile.clinica_id)
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });

  const tarefasQuery = useQuery({
    queryKey: ['tarefas', profile?.clinica_id, profile?.id],
    queryFn: async () => {
      const data = await withSafeRetry(() => buscarEmBlocos<any>(() => supabase
        .from('tarefas')
        .select('*')
        .eq('clinica_id', profile!.clinica_id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })));
      if (import.meta.env.DEV) console.log('Tarefas carregadas:', data?.length || 0);
      return data || [];
    },
    refetchOnWindowFocus: true,
    staleTime: 5000,
    enabled: !!profile?.clinica_id,
  });
  const tarefas = tarefasQuery.data;
  const isLoading = tarefasQuery.isLoading;

  const pacienteIds = useMemo(
    () => [...new Set((tarefas || []).map((t: any) => t.paciente_id).filter(Boolean))] as string[],
    [tarefas],
  );
  const pacientesQuery = useQuery({
    queryKey: ['tarefas-pacientes', profile?.clinica_id, profile?.id, pacienteIds],
    queryFn: async () => {
      if (!pacienteIds.length) return [];
      const { data, error } = await supabase.from('pacientes').select('id, nome, nome_social').in('id', pacienteIds);
      if (error) throw error;
      return data || [];
    },
    enabled: podeVincularPaciente && !!profile?.clinica_id && pacienteIds.length > 0,
  });
  const pacientesVinculados = pacientesQuery.data || [];
  const profiles = profilesQuery.data;

  const createTarefa = useMutation({
    mutationFn: async (form: any) => {
      if (!profile?.clinica_id || !user?.id) throw new Error('Usuário ou clínica não identificados.');
      const { error } = await supabase.from('tarefas').insert({ ...form, criado_por: user.id, clinica_id: profile.clinica_id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarefas'] });
      toast.success('Tarefa criada!');
      setShowNew(false);
      setForm(emptyForm);
      draft.clear();
    },
    onError: (err: any) => {
      if (import.meta.env.DEV) console.error('Erro ao criar tarefa:', err);
      toast.error('Erro ao criar tarefa: ' + (err?.message || 'Erro desconhecido'));
    },
  });

  const updateTarefa = useMutation({
    mutationFn: async ({ id, expectedUpdatedAt, ...updates }: any) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      if (updates.status) updates.data_conclusao = updates.status === 'concluida' ? new Date().toISOString() : null;
      let query = supabase.from('tarefas').update(updates).eq('id', id).eq('clinica_id', profile.clinica_id);
      query = expectedUpdatedAt ? query.eq('updated_at', expectedUpdatedAt) : query.is('updated_at', null);
      const { data, error } = await query.select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Esta tarefa foi alterada por outra pessoa. Atualize a lista e tente novamente.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarefas'] });
      toast.success('Tarefa atualizada');
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['tarefas'] });
      toast.error('Não foi possível atualizar a tarefa: ' + error.message);
    },
  });

  const deleteTarefa = useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const { data, error } = await supabase.from('tarefas').delete().eq('id', id).eq('clinica_id', profile.clinica_id).select('id');
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
      paciente: t.paciente_id ? (() => {
        const paciente = pacientesVinculados.find((p: any) => p.id === t.paciente_id);
        return paciente ? { nome: paciente.nome_social || paciente.nome } : null;
      })() : null,
      responsavel: t.responsavel_id ? { nome: profiles?.find((p: any) => p.id === t.responsavel_id)?.nome || '' } : null,
      criador: t.criado_por ? { nome: profiles?.find((p: any) => p.id === t.criado_por)?.nome || '' } : null,
    })) || [];
  }, [tarefas, profiles, pacientesVinculados]);

  const filtered = useMemo(() => {
    return enrichedTarefas.filter((t: any) => {
      const termo = normalizarTexto(search);
      const matchSearch = !termo || normalizarTexto(t.titulo).includes(termo) ||
        normalizarTexto(t.descricao).includes(termo) || normalizarTexto(t.paciente?.nome).includes(termo);
      const matchStatus = filterStatus === 'all' ||
        (filterStatus === 'overdue' ? tarefaVencida(t, hoje) : t.status === filterStatus);
      return matchSearch && matchStatus;
    });
  }, [enrichedTarefas, search, filterStatus, hoje]);

  const stats = useMemo(() => ({
    total: enrichedTarefas.length,
    pendentes: enrichedTarefas.filter((t: any) => t.status === 'pendente').length,
    emAndamento: enrichedTarefas.filter((t: any) => t.status === 'em_andamento').length,
    concluidas: enrichedTarefas.filter((t: any) => t.status === 'concluida').length,
    vencidas: enrichedTarefas.filter((t: any) => tarefaVencida(t, hoje)).length,
  }), [enrichedTarefas, hoje]);

  const [form, setForm] = useState({
    titulo: '', descricao: '', prioridade: 'media', responsavel_id: '',
    data_vencimento: '', categoria: '', paciente_id: '',
  });
  const draft = useRecoverableDraft({
    key: `elolab:draft:task:${profile?.clinica_id || 'unknown'}:${user?.id || 'unknown'}`,
    value: form,
    initialValue: emptyForm,
    onRestore: setForm,
    storage: 'session',
    enabled: showNew && !!profile?.clinica_id && !!user?.id,
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
      updateTarefa.mutate({ id: taskId, expectedUpdatedAt: task.updated_at, status: newStatus });
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
        <div className="grid w-full grid-cols-[auto_1fr] items-center gap-2 sm:flex sm:w-auto">
          <div className="flex rounded-lg border overflow-hidden">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm" className="h-11 gap-1.5 rounded-none border-0 px-3 text-xs"
              onClick={() => setViewMode('kanban')}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm" className="h-11 gap-1.5 rounded-none border-0 border-l px-3 text-xs"
              onClick={() => setViewMode('list')}
            >
              <LayoutList className="h-3.5 w-3.5" /> Lista
            </Button>
          </div>
          <Button onClick={() => setShowNew(true)} className="h-11 gap-2 shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" /> Nova Tarefa
          </Button>
        </div>
      </div>

      {/* Stats */}
      <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: 'Total', value: stats.total, icon: ListTodo, color: 'text-primary', bg: 'bg-primary/10', filter: 'all' },
          { label: 'Pendentes', value: stats.pendentes, icon: Circle, color: 'text-warning', bg: 'bg-warning/10', filter: 'pendente' },
          { label: 'Em Andamento', value: stats.emAndamento, icon: Clock, color: 'text-info', bg: 'bg-info/10', filter: 'em_andamento' },
          { label: 'Concluídas', value: stats.concluidas, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', filter: 'concluida' },
          { label: 'Vencidas', value: stats.vencidas, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', filter: 'overdue' },
        ].map((s, i) => (
          <motion.div key={s.label} variants={fadeUp} custom={i}>
            <button
              onClick={() => setFilterStatus(s.filter)}
              className={cn(
                'min-h-11 w-full rounded-xl border bg-card px-3 py-3 flex items-center gap-2 transition-all hover:shadow-md hover:-translate-y-0.5 text-left sm:gap-3 sm:px-4',
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

      {enrichedTarefas.length >= LIMITE_BUSCA_EM_BLOCOS && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>A lista atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} tarefas. Os contadores e resultados podem estar incompletos; refine a busca ou o status.</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative w-full flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar tarefas..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 pl-10" />
        </div>
        {viewMode === 'list' && (
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-11 w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="overdue">Vencidas</SelectItem>
              {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {filterStatus !== 'all' && (
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setFilterStatus('all')}>
            Limpar filtro
          </Button>
        )}
      </div>

      {/* Content */}
      {tarefasQuery.isError ? (
        <ErrorState title="Não foi possível carregar as tarefas" error={tarefasQuery.error} onRetry={() => void tarefasQuery.refetch()} />
      ) : profilesQuery.isError ? (
        <ErrorState title="Não foi possível carregar os responsáveis" description="A lista foi pausada porque os nomes da equipe não puderam ser conferidos." error={profilesQuery.error} onRetry={() => void profilesQuery.refetch()} />
      ) : pacientesQuery.isError ? (
        <ErrorState title="Não foi possível carregar os pacientes vinculados" error={pacientesQuery.error} onRetry={() => void pacientesQuery.refetch()} />
      ) : isLoading || profilesQuery.isLoading || pacientesQuery.isLoading ? (
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
      ) : filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <ListTodo className="h-14 w-14 text-muted-foreground/20 mb-4" />
              <p className="font-semibold text-lg">
                {enrichedTarefas.length === 0 ? 'Ainda não há tarefas cadastradas' : 'Nenhuma tarefa corresponde à busca e ao filtro'}
              </p>
              {enrichedTarefas.length > 0 ? (
                <Button variant="link" onClick={() => { setSearch(''); setFilterStatus('all'); }} className="mt-2 h-11">Limpar busca e filtro</Button>
              ) : (
                <Button onClick={() => setShowNew(true)} className="mt-4 gap-2"><Plus className="h-4 w-4" />Nova Tarefa</Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ) : viewMode === 'kanban' ? (
        /* ─── Kanban View ─── */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {kanbanColumns.map(col => {
            const colTasks = filtered.filter((t: any) => t.status === col.key);
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
                        hoje={hoje}
                        onUpdate={(data) => updateTarefa.mutate(data)}
                        onDelete={(id) => {
                          setDeleteTaskId(id);
                        }}
                        onDragStart={handleDragStart}
                        draggable
                        isDragging={draggedTaskId === t.id}
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
      ) : (
        /* ─── List View ─── */
        <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filtered.map((t: any) => (
              <TarefaCard
                key={t.id}
                tarefa={t}
                hoje={hoje}
                updating={updateTarefa.isPending}
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
        <DialogContent className="max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-none pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:rounded-lg">
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
              paciente_id: form.paciente_id || null,
            });
          }} className="space-y-4">
            {draft.restorable && (
              <DraftRecoveryNotice
                savedAt={draft.restorable.savedAt}
                onRestore={draft.restore}
                onDiscard={draft.discard}
              />
            )}
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input value={form.titulo} onChange={(e) => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="O que precisa ser feito?" autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Detalhes opcionais..." rows={3} />
            </div>
            {podeVincularPaciente && (
              <div className="space-y-2">
                <Label>Paciente relacionado <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <PacienteCombobox
                  value={form.paciente_id || null}
                  onChange={(id) => setForm(p => ({ ...p, paciente_id: id }))}
                  placeholder="Buscar paciente por nome, CPF ou telefone..."
                />
                {form.paciente_id && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 px-2 text-muted-foreground"
                    onClick={() => setForm(p => ({ ...p, paciente_id: '' }))}
                  >
                    Remover vínculo
                  </Button>
                )}
              </div>
            )}
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
                  <SelectContent>
                    {profiles?.filter((p: any) => p.ativo !== false).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    {!profiles?.some((p: any) => p.ativo !== false) && (
                      <SelectItem value="sem-responsaveis-ativos" disabled>Nenhum membro ativo disponível</SelectItem>
                    )}
                  </SelectContent>
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
              <span className="mr-auto self-center text-xs text-muted-foreground" aria-live="polite">
                {draft.savedAt ? `Rascunho salvo às ${draft.savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : draft.dirty ? 'Salvando rascunho…' : 'Sem alterações'}
              </span>
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
