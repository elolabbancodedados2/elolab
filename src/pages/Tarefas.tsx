import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Link as RouterLink } from 'react-router-dom';
import { PacienteCombobox } from '@/components/patients/PacienteCombobox';
import { ActionableEmptyState } from '@/components/ActionableEmptyState';
import { PageHeader } from '@/components/PageHeader';
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

import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  ListTodo, Plus, CheckCircle2, Clock, AlertTriangle, Circle, Search, Trash2,
  Loader2, CalendarClock, User2, LayoutGrid, LayoutList, GripVertical, CircleX, RotateCcw,
  Pencil, UserPlus, CalendarDays, ArrowUpDown,
} from 'lucide-react';
import { parseDateOnly, toDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { useRecoverableDraft } from '@/hooks/useRecoverableDraft';
import { DraftRecoveryNotice } from '@/components/DraftRecoveryNotice';
import { withSafeRetry } from '@/lib/retry';
import { ErrorState } from '@/components/ErrorState';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { getInitialTaskView, taskMatchesAssignee, taskMatchesSearch } from './taskViewMode';

// ─── Config ────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; icon: typeof Circle; colorClasses: string }> = {
  pendente: { label: 'Pendente', icon: Circle, colorClasses: 'bg-warning/10 text-warning border-warning/20' },
  em_andamento: { label: 'Em Andamento', icon: Clock, colorClasses: 'bg-[#1080CA]/10 text-[#1080CA] border-[#1080CA]/20' },
  concluida: { label: 'Concluída', icon: CheckCircle2, colorClasses: 'bg-success/10 text-success border-success/20' },
  cancelada: { label: 'Cancelada', icon: AlertTriangle, colorClasses: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const prioridadeConfig: Record<string, { label: string; dot: string; stripe: string; ordem: number }> = {
  baixa: { label: 'Baixa', dot: 'bg-muted-foreground', stripe: 'border-l-muted-foreground/40', ordem: 3 },
  media: { label: 'Média', dot: 'bg-[#1080CA]', stripe: 'border-l-[#1080CA]', ordem: 2 },
  alta: { label: 'Alta', dot: 'bg-warning', stripe: 'border-l-warning', ordem: 1 },
  urgente: { label: 'Urgente', dot: 'bg-destructive animate-pulse', stripe: 'border-l-destructive', ordem: 0 },
};

const kanbanColumns = [
  { key: 'pendente', label: 'Pendente', icon: Circle, head: 'bg-warning/10 text-warning' },
  { key: 'em_andamento', label: 'Em Andamento', icon: Clock, head: 'bg-gradient-primary text-white' },
  { key: 'concluida', label: 'Concluída', icon: CheckCircle2, head: 'bg-success/10 text-success' },
  { key: 'cancelada', label: 'Cancelada', icon: AlertTriangle, head: 'bg-muted text-muted-foreground' },
];

const categorias = ['Administrativo', 'Clínico', 'Financeiro', 'TI', 'Manutenção', 'RH', 'Outro'];

const tarefaAberta = (tarefa: any) => tarefa.status !== 'concluida' && tarefa.status !== 'cancelada';
const tarefaVencida = (tarefa: any, hoje: string) =>
  Boolean(tarefa.data_vencimento && tarefa.data_vencimento < hoje && tarefaAberta(tarefa));
const tarefaDeHoje = (tarefa: any, hoje: string) => Boolean(tarefa.data_vencimento && tarefa.data_vencimento === hoje);

type FiltroRapido = 'none' | 'hoje' | 'semana' | 'sem_responsavel';
type Ordenacao = 'recentes' | 'vencimento' | 'prioridade';

interface TarefaForm {
  titulo: string; descricao: string; prioridade: string; responsavel_id: string;
  data_vencimento: string; categoria: string; paciente_id: string;
}

const formVazio: TarefaForm = { titulo: '', descricao: '', prioridade: 'media', responsavel_id: '', data_vencimento: '', categoria: '', paciente_id: '' };

function formDaTarefa(t: any): TarefaForm {
  return {
    titulo: t.titulo ?? '', descricao: t.descricao ?? '', prioridade: t.prioridade ?? 'media',
    responsavel_id: t.responsavel_id ?? '', data_vencimento: t.data_vencimento ?? '',
    categoria: t.categoria ?? '', paciente_id: t.paciente_id ?? '',
  };
}

interface AcoesTarefa {
  onUpdate: (data: any) => void;
  onDelete: (id: string) => void;
  onEdit: (tarefa: any) => void;
  onAssumir: (tarefa: any) => void;
  canOpenPatient: boolean;
  updating: boolean;
  hoje: string;
}

// ─── Kanban Card (compact) ─────────────────────────────────
function KanbanCard({ tarefa, hoje, onUpdate, onDelete, onEdit, onAssumir, onDragStart, canOpenPatient, draggable = true, isDragging = false, updating = false }: AcoesTarefa & {
  tarefa: any;
  onDragStart: (e: React.DragEvent, id: string) => void;
  draggable?: boolean;
  isDragging?: boolean;
}) {
  const pc = prioridadeConfig[tarefa.prioridade] || prioridadeConfig.media;
  const vencida = tarefaVencida(tarefa, hoje);
  const venceHoje = tarefaDeHoje(tarefa, hoje);

  return (
    <div className="animate-in fade-in zoom-in-95 duration-200">
      <div
        draggable={draggable}
        onDragStart={draggable ? (e) => onDragStart(e, tarefa.id) : undefined}
        className={cn(
          'group rounded-2xl border border-border/60 border-l-4 bg-card p-3 shadow-xs transition-all hover:-translate-y-0.5 hover:border-[#1080CA]/40 hover:shadow-md',
          pc.stripe,
          draggable && 'cursor-grab active:cursor-grabbing',
          isDragging && 'opacity-50 scale-[0.98]',
          vencida && 'ring-1 ring-destructive/30',
          !tarefaAberta(tarefa) && 'opacity-60',
        )}
      >
        <div className="flex items-start gap-2">
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/60" />
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-semibold leading-snug', tarefa.status === 'concluida' && 'line-through text-muted-foreground')}>
              {tarefa.titulo}
            </p>
            {tarefa.descricao && (
              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{tarefa.descricao}</p>
            )}
            {tarefa.paciente?.nome && (
              canOpenPatient ? <RouterLink
                to={`/pacientes?paciente=${encodeURIComponent(tarefa.paciente_id)}`}
                onClick={(event) => event.stopPropagation()}
                className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs text-[#1080CA] hover:underline"
              >
                <User2 className="h-3 w-3" /> {tarefa.paciente.nome}
              </RouterLink> : <span className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground"><User2 className="h-3 w-3" /> {tarefa.paciente.nome}</span>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <span className={cn('h-1.5 w-1.5 rounded-full', pc.dot)} />
                <span className="text-[10px] text-muted-foreground">{pc.label}</span>
              </div>
              {tarefa.categoria && (
                <Badge variant="outline" className="h-4 px-1.5 text-[9px]">{tarefa.categoria}</Badge>
              )}
              {tarefa.responsavel?.nome ? (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <User2 className="h-2.5 w-2.5" /> {tarefa.responsavel.nome.split(' ')[0]}
                </span>
              ) : tarefaAberta(tarefa) && (
                <button type="button" disabled={updating} onClick={() => onAssumir(tarefa)} aria-label={`Assumir tarefa ${tarefa.titulo}`} className="inline-flex items-center gap-0.5 rounded-full bg-[#1080CA]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#1080CA] hover:bg-[#1080CA]/20">
                  <UserPlus className="h-2.5 w-2.5" /> Assumir
                </button>
              )}
            </div>
            {tarefa.data_vencimento && (
              <p className={cn(
                'mt-1.5 flex items-center gap-1 text-[10px]',
                vencida ? 'font-semibold text-destructive' : venceHoje ? 'font-semibold text-warning' : 'text-muted-foreground',
              )}>
                <CalendarClock className="h-2.5 w-2.5" />
                {format(parseDateOnly(tarefa.data_vencimento)!, 'dd/MM', { locale: ptBR })}
                {vencida && ' · vencida'}
                {venceHoje && ' · hoje'}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col">
            {tarefa.status === 'pendente' && (
              <Button size="icon" variant="ghost" className="h-11 w-11 p-0 text-[#1080CA]" disabled={updating} onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: 'em_andamento' })} aria-label={`Iniciar tarefa ${tarefa.titulo}`} title="Iniciar tarefa">
                <Clock className="h-3.5 w-3.5" />
              </Button>
            )}
            {tarefa.status === 'em_andamento' && (
              <Button size="icon" variant="ghost" className="h-11 w-11 p-0 text-success" disabled={updating} onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: 'concluida' })} aria-label={`Concluir tarefa ${tarefa.titulo}`} title="Concluir tarefa">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {!tarefaAberta(tarefa) ? (
              <Button size="icon" variant="ghost" className="h-11 w-11 p-0 text-[#1080CA]" disabled={updating} onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: 'pendente' })} aria-label={`Reabrir tarefa ${tarefa.titulo}`} title="Reabrir tarefa">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="icon" variant="ghost" className="h-11 w-11 p-0 text-warning opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" disabled={updating} onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: 'cancelada' })} aria-label={`Cancelar tarefa ${tarefa.titulo}`} title="Cancelar tarefa">
                <CircleX className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-11 w-11 p-0 text-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" onClick={() => onEdit(tarefa)} aria-label={`Editar tarefa ${tarefa.titulo}`} title="Editar tarefa">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-11 w-11 p-0 text-destructive opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" onClick={() => onDelete(tarefa.id)} aria-label={`Excluir tarefa ${tarefa.titulo}`}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Task Card (list view) ─────────────────────────────────
function TarefaCard({ tarefa, hoje, onUpdate, onDelete, onEdit, onAssumir, canOpenPatient, updating }: AcoesTarefa & { tarefa: any }) {
  const sc = statusConfig[tarefa.status] || statusConfig.pendente;
  const pc = prioridadeConfig[tarefa.prioridade] || prioridadeConfig.media;
  const vencida = tarefaVencida(tarefa, hoje);
  const venceHoje = tarefaDeHoje(tarefa, hoje);
  const StatusIcon = sc.icon;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
      <Card className={cn(
        'group rounded-2xl border-border/60 border-l-4 bg-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1080CA]/40 hover:shadow-md',
        pc.stripe,
        vencida && 'ring-1 ring-destructive/30',
        tarefa.status === 'concluida' && 'opacity-60',
      )}>
        <CardContent className="px-5 py-4">
          <div className="flex items-start gap-3">
            {tarefaAberta(tarefa) && <button
              type="button"
              aria-label={tarefa.status === 'pendente' ? 'Iniciar tarefa ' + tarefa.titulo : 'Concluir tarefa ' + tarefa.titulo}
              title={tarefa.status === 'pendente' ? 'Iniciar tarefa' : 'Concluir tarefa'}
              disabled={updating}
              onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: tarefa.status === 'pendente' ? 'em_andamento' : 'concluida' })}
              className={cn(
                'mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-all sm:h-8 sm:w-8',
                'border-border hover:border-[#1080CA] hover:bg-[#1080CA]/5 disabled:cursor-wait disabled:opacity-50',
                tarefa.status === 'em_andamento' && 'border-[#1080CA] text-[#1080CA]',
              )}
            >
              {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tarefa.status === 'em_andamento' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
            </button>}
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={cn('text-sm font-semibold', tarefa.status === 'concluida' && 'line-through text-muted-foreground')}>
                  {tarefa.titulo}
                </span>
                <div className="flex items-center gap-1">
                  <span className={cn('h-1.5 w-1.5 rounded-full', pc.dot)} />
                  <span className="text-[10px] text-muted-foreground">{pc.label}</span>
                </div>
              </div>
              {tarefa.descricao && (
                <p className="mb-1.5 line-clamp-1 text-xs text-muted-foreground">{tarefa.descricao}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                <Badge className={cn('h-5 border text-[10px]', sc.colorClasses)}>
                  <StatusIcon className="mr-1 h-2.5 w-2.5" />{sc.label}
                </Badge>
                {tarefa.categoria && <Badge variant="outline" className="h-5 text-[10px]">{tarefa.categoria}</Badge>}
                {tarefa.paciente?.nome && (
                  canOpenPatient ? <RouterLink
                    to={`/pacientes?paciente=${encodeURIComponent(tarefa.paciente_id)}`}
                    className="inline-flex min-h-11 items-center gap-1 text-[#1080CA] hover:underline"
                  >
                    <User2 className="h-3 w-3" /> {tarefa.paciente.nome}
                  </RouterLink> : <span className="inline-flex min-h-11 items-center gap-1 text-muted-foreground"><User2 className="h-3 w-3" /> {tarefa.paciente.nome}</span>
                )}
                {tarefa.responsavel?.nome ? (
                  <span className="flex items-center gap-1"><User2 className="h-3 w-3" />{tarefa.responsavel.nome}</span>
                ) : tarefaAberta(tarefa) && (
                  <button type="button" disabled={updating} onClick={() => onAssumir(tarefa)} aria-label={`Assumir tarefa ${tarefa.titulo}`} className="inline-flex min-h-11 items-center gap-1 font-semibold text-[#1080CA] hover:underline">
                    <UserPlus className="h-3 w-3" /> Assumir
                  </button>
                )}
                {tarefa.data_vencimento && (
                  <span className={cn('flex items-center gap-1', vencida && 'font-semibold text-destructive', venceHoje && 'font-semibold text-warning')}>
                    <CalendarClock className="h-3 w-3" />
                    {format(parseDateOnly(tarefa.data_vencimento)!, 'dd/MM/yyyy', { locale: ptBR })}
                    {vencida && ' (vencida)'}{venceHoje && ' (hoje)'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
              {tarefa.status === 'pendente' && (
                <Button size="sm" variant="ghost" className="h-11 gap-1 text-xs text-[#1080CA]" disabled={updating} onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: 'em_andamento' })}>
                  <Clock className="h-3 w-3" /> Iniciar
                </Button>
              )}
              {tarefa.status === 'em_andamento' && (
                <Button size="sm" variant="ghost" className="h-11 gap-1 text-xs text-success" disabled={updating} onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: 'concluida' })}>
                  <CheckCircle2 className="h-3 w-3" /> Concluir
                </Button>
              )}
              {!tarefaAberta(tarefa) ? (
                <Button size="sm" variant="ghost" className="h-11 gap-1 text-xs text-[#1080CA]" disabled={updating} onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: 'pendente' })} aria-label={`Reabrir tarefa ${tarefa.titulo}`}>
                  <RotateCcw className="h-3 w-3" /> Reabrir
                </Button>
              ) : (
                <Button size="sm" variant="ghost" className="h-11 gap-1 text-xs text-warning" disabled={updating} onClick={() => onUpdate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, status: 'cancelada' })}>
                  <CircleX className="h-3 w-3" /> Cancelar
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-11 w-11 p-0" onClick={() => onEdit(tarefa)} aria-label={`Editar tarefa ${tarefa.titulo}`} title="Editar tarefa">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-11 w-11 p-0 text-destructive" onClick={() => onDelete(tarefa.id)} aria-label={`Excluir tarefa ${tarefa.titulo}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function Tarefas() {
  const { user, profile, isAdmin, hasRole } = useSupabaseAuth();
  const podeVincularPaciente = isAdmin() || hasRole('recepcao') || hasRole('enfermagem') || hasRole('medico');
  const podeAbrirPaciente = podeVincularPaciente;
  const [agora, setAgora] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>('none');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('recentes');
  const [onlyMine, setOnlyMine] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() => getInitialTaskView(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(any-pointer: coarse)').matches
      : false,
  ));
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const hoje = todaySaoPauloDateOnly(agora);
  const fimSemana = useMemo(() => {
    const d = parseDateOnly(hoje)!;
    d.setDate(d.getDate() + (7 - ((d.getDay() + 6) % 7)) - 1);
    return toDateOnly(d);
  }, [hoje]);

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '');
      const dialogOpen = Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));
      if (event.key === '/' && !typing && !dialogOpen && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === 'Escape' && target === searchInputRef.current && search) {
        setSearch('');
      }
    };
    window.addEventListener('keydown', handleSearchShortcut);
    return () => window.removeEventListener('keydown', handleSearchShortcut);
  }, [search]);

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
    refetchInterval: 60_000,
    queryFn: async () => {
      const data = await withSafeRetry(() => buscarEmBlocos<any>(() => supabase
        .from('tarefas')
        .select('*')
        .eq('clinica_id', profile!.clinica_id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })));
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

  const [form, setForm] = useState<TarefaForm>(formVazio);
  const draft = useRecoverableDraft({
    key: `elolab:draft:task:${profile?.clinica_id || 'unknown'}:${user?.id || 'unknown'}`,
    value: form,
    initialValue: formVazio,
    onRestore: setForm,
    storage: 'session',
    enabled: showNew && !editing && !!profile?.clinica_id && !!user?.id,
  });

  const fecharDialogo = () => { setShowNew(false); setEditing(null); setForm(formVazio); };
  const abrirEdicao = (tarefa: any) => { setEditing(tarefa); setForm(formDaTarefa(tarefa)); setShowNew(true); };

  const createTarefa = useMutation({
    mutationFn: async (dados: any) => {
      if (!profile?.clinica_id || !user?.id) throw new Error('Usuário ou clínica não identificados.');
      const { error } = await supabase.from('tarefas').insert({ ...dados, criado_por: user.id, clinica_id: profile.clinica_id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarefas'] });
      toast.success('Tarefa criada!');
      fecharDialogo();
      draft.clear();
    },
    onError: (err: any) => {
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
      if (editing) fecharDialogo();
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
    const lista = enrichedTarefas.filter((t: any) => {
      const matchSearch = taskMatchesSearch(t, search);
      const matchStatus = filterStatus === 'all'
        || (filterStatus === 'overdue' ? tarefaVencida(t, hoje)
          : filterStatus === 'today' ? tarefaDeHoje(t, hoje) && tarefaAberta(t)
            : t.status === filterStatus);
      const matchAssignee = taskMatchesAssignee(t, onlyMine, user?.id);
      const matchRapido = filtroRapido === 'none'
        || (filtroRapido === 'hoje' ? tarefaDeHoje(t, hoje) && tarefaAberta(t)
          : filtroRapido === 'semana' ? Boolean(t.data_vencimento && t.data_vencimento >= hoje && t.data_vencimento <= fimSemana && tarefaAberta(t))
            : !t.responsavel_id && tarefaAberta(t));
      return matchSearch && matchStatus && matchAssignee && matchRapido;
    });
    if (ordenacao === 'vencimento') {
      return [...lista].sort((a: any, b: any) => (a.data_vencimento ?? '9999').localeCompare(b.data_vencimento ?? '9999'));
    }
    if (ordenacao === 'prioridade') {
      return [...lista].sort((a: any, b: any) => (prioridadeConfig[a.prioridade]?.ordem ?? 2) - (prioridadeConfig[b.prioridade]?.ordem ?? 2));
    }
    return lista;
  }, [enrichedTarefas, search, filterStatus, onlyMine, user?.id, hoje, filtroRapido, fimSemana, ordenacao]);

  const stats = useMemo(() => ({
    total: enrichedTarefas.length,
    pendentes: enrichedTarefas.filter((t: any) => t.status === 'pendente').length,
    emAndamento: enrichedTarefas.filter((t: any) => t.status === 'em_andamento').length,
    concluidas: enrichedTarefas.filter((t: any) => t.status === 'concluida').length,
    vencidas: enrichedTarefas.filter((t: any) => tarefaVencida(t, hoje)).length,
    hoje: enrichedTarefas.filter((t: any) => tarefaDeHoje(t, hoje) && tarefaAberta(t)).length,
  }), [enrichedTarefas, hoje]);

  const temFiltro = filterStatus !== 'all' || !!search || onlyMine || filtroRapido !== 'none';
  const limparFiltros = () => { setSearch(''); setFilterStatus('all'); setOnlyMine(false); setFiltroRapido('none'); };

  const assumirTarefa = (tarefa: any) => {
    if (!user?.id) return;
    updateTarefa.mutate({ id: tarefa.id, expectedUpdatedAt: tarefa.updated_at, responsavel_id: user.id });
  };

  const salvarFormulario = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim()) { toast.error('Título é obrigatório'); return; }
    const dados = {
      titulo: form.titulo.trim(),
      descricao: form.descricao || null,
      prioridade: form.prioridade,
      responsavel_id: form.responsavel_id || null,
      data_vencimento: form.data_vencimento || null,
      categoria: form.categoria || null,
      paciente_id: form.paciente_id || null,
    };
    if (editing) updateTarefa.mutate({ id: editing.id, expectedUpdatedAt: editing.updated_at, ...dados });
    else createTarefa.mutate(dados);
  };

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

  const acoes: AcoesTarefa = {
    hoje,
    canOpenPatient: podeAbrirPaciente,
    updating: updateTarefa.isPending,
    onUpdate: (data) => updateTarefa.mutate(data),
    onDelete: (id) => setDeleteTaskId(id),
    onEdit: abrirEdicao,
    onAssumir: assumirTarefa,
  };

  const filtrosRapidos: Array<{ key: FiltroRapido; label: string; icon: typeof Clock }> = [
    { key: 'hoje', label: 'Vence hoje', icon: CalendarDays },
    { key: 'semana', label: 'Esta semana', icon: CalendarClock },
    { key: 'sem_responsavel', label: 'Sem responsável', icon: UserPlus },
  ];

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <PageHeader
        title="Tarefas da equipe"
        description="Organize prioridades, acompanhe prazos e distribua o trabalho."
        icon={<ListTodo />}
        actions={(
          <>
            <div className="flex rounded-full border border-border/60 bg-muted/60 p-1">
              <Button
                variant="ghost"
                size="sm" className={cn('h-9 gap-1.5 rounded-full border-0 px-3 text-xs', viewMode === 'kanban' && 'bg-gradient-primary text-white shadow-sm hover:text-white')}
                onClick={() => setViewMode('kanban')}
                aria-pressed={viewMode === 'kanban'}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Kanban
              </Button>
              <Button
                variant="ghost"
                size="sm" className={cn('h-9 gap-1.5 rounded-full border-0 px-3 text-xs', viewMode === 'list' && 'bg-gradient-primary text-white shadow-sm hover:text-white')}
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
              >
                <LayoutList className="h-3.5 w-3.5" /> Lista
              </Button>
            </div>
            <Button onClick={() => { setEditing(null); setForm(formVazio); setShowNew(true); }} className="h-11 w-full gap-2 rounded-full bg-gradient-primary px-5 text-white shadow-md hover:brightness-110 sm:w-auto">
              <Plus className="h-4 w-4" /> Nova Tarefa
            </Button>
          </>
        )}
      />

      {/* Stats */}
      <div role="group" aria-label="Filtrar tarefas por status" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Total', value: stats.total, icon: ListTodo, iconBg: 'bg-[#1080CA]/10', iconColor: 'text-[#1080CA]', filter: 'all' },
          { label: 'Pendentes', value: stats.pendentes, icon: Circle, iconBg: 'bg-warning/10', iconColor: 'text-warning-foreground', filter: 'pendente' },
          { label: 'Em Andamento', value: stats.emAndamento, icon: Clock, iconBg: 'bg-[#1080CA]/10', iconColor: 'text-[#1080CA]', filter: 'em_andamento' },
          { label: 'Concluídas', value: stats.concluidas, icon: CheckCircle2, iconBg: 'bg-success/10', iconColor: 'text-success', filter: 'concluida' },
          { label: 'Vence hoje', value: stats.hoje, icon: CalendarDays, iconBg: 'bg-warning/10', iconColor: 'text-warning-foreground', filter: 'today' },
          { label: 'Vencidas', value: stats.vencidas, icon: AlertTriangle, iconBg: 'bg-destructive/10', iconColor: 'text-destructive', filter: 'overdue' },
        ].map((s) => {
          const ativo = filterStatus === s.filter;
          return (
            <div key={s.label} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
              <button
                type="button"
                aria-pressed={ativo}
                onClick={() => setFilterStatus(s.filter)}
                className={cn(
                  'flex min-h-[76px] w-full items-center gap-2 rounded-2xl border px-3 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md sm:gap-3 sm:px-4',
                  ativo ? 'border-transparent bg-gradient-primary text-white shadow-md' : 'border-border/60 bg-card shadow-xs hover:border-[#1080CA]/40',
                )}
              >
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.iconBg, s.iconColor, ativo && 'bg-white/15 text-white')}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums">{s.value}</p>
                  <p className={cn('text-[11px] font-medium', ativo ? 'text-white/70' : 'text-muted-foreground')}>{s.label}</p>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {enrichedTarefas.length >= LIMITE_BUSCA_EM_BLOCOS && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>A lista atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} tarefas. Os contadores e resultados podem estar incompletos; refine a busca ou o status.</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-[22px] border border-border/60 bg-card p-3 shadow-xs sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input ref={searchInputRef} aria-label="Buscar tarefas" aria-keyshortcuts="/ Escape" placeholder="Buscar por tarefa, pessoa ou categoria... ( / )" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-full pl-10 focus-visible:ring-[#1080CA]" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger aria-label="Filtrar tarefas por status" className="h-11 w-full rounded-full sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="today">Vence hoje</SelectItem>
              <SelectItem value="overdue">Vencidas</SelectItem>
              {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as Ordenacao)}>
            <SelectTrigger aria-label="Ordenar tarefas" className="h-11 w-full rounded-full sm:w-[190px]">
              <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recentes">Mais recentes</SelectItem>
              <SelectItem value="vencimento">Por vencimento</SelectItem>
              <SelectItem value="prioridade">Por prioridade</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            aria-pressed={onlyMine}
            className={cn('h-11 gap-2 rounded-full', onlyMine && 'border-transparent bg-gradient-primary text-white hover:brightness-110 hover:text-white')}
            onClick={() => setOnlyMine((current) => !current)}
          >
            <User2 className="h-4 w-4" /> Minhas tarefas
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rápidos</span>
          {filtrosRapidos.map(({ key, label, icon: Icon }) => {
            const ativo = filtroRapido === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltroRapido(ativo ? 'none' : key)}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition',
                  ativo ? 'border-transparent bg-gradient-primary text-white shadow-sm' : 'border-border/60 bg-background text-foreground hover:border-[#1080CA]/40 hover:text-[#1080CA]',
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            );
          })}
          {temFiltro && (
            <Button variant="ghost" size="sm" className="ml-auto h-9 gap-1 rounded-full text-xs" onClick={limparFiltros}>
              <CircleX className="h-3.5 w-3.5" /> Limpar busca e filtros
            </Button>
          )}
        </div>
      </div>

      <p className="-mt-2 px-1 text-xs text-muted-foreground" role="status" aria-live="polite">
        {temFiltro ? `${filtered.length} de ${enrichedTarefas.length} tarefas` : `${enrichedTarefas.length} tarefas`}
        <span className="ml-2 hidden sm:inline">Atalho: / para buscar · Esc para limpar</span>
      </p>

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
            <Card key={i}><CardContent className="px-5 py-4">
              <div className="flex gap-3">
                <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            </CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="animate-in fade-in duration-300">
          <Card className="rounded-[22px]">
            <CardContent className="py-4">
              <ActionableEmptyState
                title={enrichedTarefas.length === 0 ? 'Ainda não há tarefas cadastradas' : 'Nenhuma tarefa corresponde à busca e ao filtro'}
                description={enrichedTarefas.length === 0
                  ? 'Crie uma tarefa para organizar pendências e acompanhar quem será responsável.'
                  : 'Tente outro termo ou remova os filtros para voltar a ver suas tarefas.'}
                actionLabel={enrichedTarefas.length === 0 ? 'Nova tarefa' : 'Limpar busca e filtro'}
                onAction={enrichedTarefas.length === 0
                  ? () => { setEditing(null); setForm(formVazio); setShowNew(true); }
                  : limparFiltros}
                actionIcon={enrichedTarefas.length === 0 ? Plus : undefined}
                className="py-12"
              />
            </CardContent>
          </Card>
        </div>
      ) : viewMode === 'kanban' ? (
        /* ─── Kanban View ─── */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kanbanColumns.map(col => {
            const colTasks = filtered.filter((t: any) => t.status === col.key);
            const ColIcon = col.icon;
            return (
              <div
                key={col.key}
                className={cn(
                  'min-h-[340px] rounded-[22px] border border-border/60 bg-muted/40 p-3 transition-colors sm:min-h-[400px]',
                  draggedTaskId && 'border-dashed border-[#1080CA]/50',
                )}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.key)}
              >
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', col.head)}><ColIcon className="h-4 w-4" /></span>
                  <h3 className="text-sm font-bold text-foreground">{col.label}</h3>
                  <Badge variant="outline" className="ml-auto h-6 border-border/60 bg-card text-[10px] text-foreground">{colTasks.length}</Badge>
                </div>
                <div className="space-y-2">
                  {colTasks.map((t: any) => (
                    <KanbanCard
                      key={t.id}
                      tarefa={t}
                      {...acoes}
                      onDragStart={handleDragStart}
                      draggable
                      isDragging={draggedTaskId === t.id}
                    />
                  ))}
                  {colTasks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
                      <ColIcon className="mb-2 h-8 w-8" />
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
        <div className="space-y-2">
          {filtered.map((t: any) => (
            <TarefaCard key={t.id} tarefa={t} {...acoes} />
          ))}
        </div>
      )}

      {/* Dialog Nova / Editar Tarefa */}
      <Dialog open={showNew} onOpenChange={(open) => { if (!open) fecharDialogo(); }}>
        <DialogContent className="max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-none pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:rounded-[22px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary text-white">
                {editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </span>
              {editing ? 'Editar Tarefa' : 'Nova Tarefa'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={salvarFormulario} className="space-y-4">
            {!editing && draft.restorable && (
              <DraftRecoveryNotice
                savedAt={draft.restorable.savedAt}
                onRestore={draft.restore}
                onDiscard={draft.discard}
              />
            )}
            <div className="space-y-2">
              <Label htmlFor="task-title">Título *</Label>
              <Input id="task-title" value={form.titulo} onChange={(e) => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="O que precisa ser feito?" autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-description">Descrição</Label>
              <Textarea id="task-description" value={form.descricao} onChange={(e) => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Detalhes opcionais..." rows={3} />
            </div>
            {podeVincularPaciente && (
              <div className="space-y-2">
                <Label htmlFor="task-patient">Paciente relacionado <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <PacienteCombobox
                  id="task-patient"
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="task-priority">Prioridade</Label>
                <Select value={form.prioridade} onValueChange={(v) => setForm(p => ({ ...p, prioridade: v }))}>
                  <SelectTrigger id="task-priority"><SelectValue /></SelectTrigger>
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
                <Label htmlFor="task-due-date">Vencimento</Label>
                <Input id="task-due-date" type="date" value={form.data_vencimento} onChange={(e) => setForm(p => ({ ...p, data_vencimento: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="task-assignee">Responsável</Label>
                <Select value={form.responsavel_id} onValueChange={(v) => setForm(p => ({ ...p, responsavel_id: v }))}>
                  <SelectTrigger id="task-assignee"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {profiles?.filter((p: any) => p.ativo !== false || p.id === form.responsavel_id).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    {!profiles?.some((p: any) => p.ativo !== false) && (
                      <SelectItem value="sem-responsaveis-ativos" disabled>Nenhum membro ativo disponível</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-category">Categoria</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm(p => ({ ...p, categoria: v }))}>
                  <SelectTrigger id="task-category"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {categorias.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <span className="mr-auto self-center text-xs text-muted-foreground" aria-live="polite">
                {editing
                  ? 'Alterações são salvas ao confirmar'
                  : draft.savedAt ? `Rascunho salvo às ${draft.savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : draft.dirty ? 'Salvando rascunho…' : 'Sem alterações'}
              </span>
              <Button variant="outline" type="button" className="rounded-full" onClick={fecharDialogo}>Cancelar</Button>
              <Button type="submit" className="gap-2 rounded-full bg-gradient-primary text-white hover:brightness-110" disabled={!form.titulo.trim() || createTarefa.isPending || updateTarefa.isPending}>
                {(createTarefa.isPending || updateTarefa.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Salvar alterações' : 'Criar Tarefa'}
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
