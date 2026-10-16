import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, CalendarClock, CalendarPlus, Check, Circle, Clock3, Eye, EyeOff, ListTodo, Loader2, Play, Sparkles, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { ActionableEmptyState } from '@/components/ActionableEmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { dateOnlyInTimeZone, parseDateOnly, toDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { formatWithDatePreference as format } from '@/lib/datePreference';
import { logAudit } from '@/lib/auditTrail';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { withSafeRetry } from '@/lib/retry';
import { cn } from '@/lib/utils';
import { groupPersonalTasks, PersonalTask, PersonalTaskGroups } from './personalTaskQueue';

const EMPTY_TASKS: PersonalTask[] = [];

type SectionKey = keyof Pick<PersonalTaskGroups, 'overdue' | 'today' | 'upcoming' | 'noDeadline' | 'completed'>;

const sectionConfig: Array<{ key: SectionKey; title: string; icon: typeof Circle; tone: string; chip: string }> = [
  { key: 'overdue', title: 'Atrasadas', icon: AlertTriangle, tone: 'text-destructive', chip: 'bg-destructive/10 text-destructive' },
  { key: 'today', title: 'Para hoje', icon: Clock3, tone: 'text-warning-foreground', chip: 'bg-warning/10 text-warning-foreground' },
  { key: 'upcoming', title: 'Próximas', icon: CalendarClock, tone: 'text-[#1080CA]', chip: 'bg-[#1080CA]/10 text-[#1080CA]' },
  { key: 'noDeadline', title: 'Sem prazo', icon: Circle, tone: 'text-muted-foreground', chip: 'bg-muted text-muted-foreground' },
  { key: 'completed', title: 'Concluídas e canceladas', icon: Check, tone: 'text-success', chip: 'bg-success/10 text-success' },
];

const statusLabel: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const prioridadeInfo: Record<string, { label: string; stripe: string; badge: string; ordem: number }> = {
  urgente: { label: 'Urgente', stripe: 'border-l-destructive', badge: 'bg-destructive/10 text-destructive', ordem: 0 },
  alta: { label: 'Alta', stripe: 'border-l-warning', badge: 'bg-warning/10 text-warning-foreground', ordem: 1 },
  media: { label: 'Média', stripe: 'border-l-[#1080CA]', badge: 'bg-[#1080CA]/10 text-[#1080CA]', ordem: 2 },
  baixa: { label: 'Baixa', stripe: 'border-l-muted-foreground/40', badge: 'bg-muted text-muted-foreground', ordem: 3 },
};

const isOpen = (task: PersonalTask) => task.status !== 'concluida' && task.status !== 'cancelada';

export default function MinhaFilaTarefas() {
  const { user, profile, isAdmin, hasRole } = useSupabaseAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const [ocultarConcluidas, setOcultarConcluidas] = useState(false);
  const today = todaySaoPauloDateOnly(now);
  const clinicaId = profile?.clinica_id;
  const userId = user?.id;
  const canOpenPatient = isAdmin() || hasRole('recepcao') || hasRole('enfermagem') || hasRole('medico');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const tarefasQuery = useQuery({
    queryKey: ['minha-fila-tarefas', clinicaId, userId],
    queryFn: async () => {
      if (!clinicaId || !userId) return [];
      return withSafeRetry(() => buscarEmBlocos<PersonalTask>(() => supabase
        .from('tarefas')
        .select('id,titulo,descricao,status,prioridade,categoria,data_vencimento,paciente_id,updated_at')
        .eq('clinica_id', clinicaId)
        .eq('responsavel_id', userId)
        .order('data_vencimento', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })));
    },
    enabled: Boolean(clinicaId && userId),
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  const tarefas = tarefasQuery.data ?? EMPTY_TASKS;
  const groups = useMemo(() => groupPersonalTasks(tarefas, today), [tarefas, today]);

  const atualizar = useMutation({
    mutationFn: async ({ task, values, changes, sucesso }: {
      task: PersonalTask;
      values: TablesUpdate<'tarefas'>;
      changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
      sucesso: string;
    }) => {
      if (!clinicaId || !userId) throw new Error('Sua sessão expirou. Entre novamente para atualizar a tarefa.');
      const { data, error } = await supabase
        .from('tarefas')
        .update(values)
        .eq('id', task.id)
        .eq('clinica_id', clinicaId)
        .eq('responsavel_id', userId)
        .eq('updated_at', task.updated_at)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Esta tarefa mudou desde a última atualização. Recarregue a fila e tente novamente.');
      await logAudit({ action: 'update', collection: 'tarefas', recordId: task.id, userId, changes });
      return sucesso;
    },
    onSuccess: async (sucesso) => {
      toast.success(sucesso);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['minha-fila-tarefas', clinicaId, userId] }),
        queryClient.invalidateQueries({ queryKey: ['tarefas'] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar a tarefa'),
  });

  const concluir = (task: PersonalTask) => atualizar.mutate({
    task, values: { status: 'concluida' }, sucesso: 'Tarefa concluída',
    changes: [{ field: 'status', oldValue: task.status, newValue: 'concluida' }],
  });
  const iniciar = (task: PersonalTask) => atualizar.mutate({
    task, values: { status: 'em_andamento' }, sucesso: 'Tarefa iniciada',
    changes: [{ field: 'status', oldValue: task.status, newValue: 'em_andamento' }],
  });
  const adiar = (task: PersonalTask) => {
    const base = parseDateOnly(task.data_vencimento && task.data_vencimento > today ? task.data_vencimento : today)!;
    base.setDate(base.getDate() + 1);
    const novo = toDateOnly(base);
    atualizar.mutate({
      task, values: { data_vencimento: novo }, sucesso: `Prazo movido para ${format(parseDateOnly(novo), 'dd/MM')}`,
      changes: [{ field: 'data_vencimento', oldValue: task.data_vencimento, newValue: novo }],
    });
  };

  const activeCount = groups.overdue.length + groups.today.length + groups.upcoming.length + groups.noDeadline.length;
  const showingCompletedOnly = groups.total > 0 && activeCount === 0;

  const proxima = useMemo(() => {
    const porPrioridade = (lista: PersonalTask[]) => [...lista].sort((a, b) => (prioridadeInfo[a.prioridade]?.ordem ?? 2) - (prioridadeInfo[b.prioridade]?.ordem ?? 2));
    return porPrioridade(groups.overdue)[0] ?? porPrioridade(groups.today)[0] ?? porPrioridade(groups.upcoming)[0] ?? porPrioridade(groups.noDeadline)[0] ?? null;
  }, [groups]);

  const concluidasHoje = useMemo(() => groups.completed.filter(t => t.status === 'concluida' && dateOnlyInTimeZone(new Date(t.updated_at), 'America/Sao_Paulo') === today).length, [groups.completed, today]);
  const metaDoDia = concluidasHoje + groups.today.length + groups.overdue.length;
  const progresso = metaDoDia > 0 ? Math.round((concluidasHoje / metaDoDia) * 100) : 0;

  const irParaSecao = (key: SectionKey) => document.getElementById(`fila-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="space-y-5 pb-8">
      <section className="relative isolate overflow-hidden rounded-[22px] border border-border/60 bg-card p-5 shadow-xs sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 h-56 w-56 rounded-full bg-gradient-primary opacity-[0.12] blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#1080CA]">Sua rotina</p>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-white"><ListTodo aria-hidden="true" className="h-5 w-5" /></span> Minha fila de trabalho
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Tarefas atribuídas a você, organizadas por prazo.</p>
          </div>
          <Button asChild className="h-11 gap-2 rounded-full bg-[#111111] px-5 text-white shadow-md hover:bg-[#2b2b33]">
            <Link to="/tarefas">Abrir quadro da equipe <ArrowUpRight aria-hidden="true" className="h-4 w-4" /></Link>
          </Button>
        </div>
      </section>

      {tarefasQuery.isError ? (
        <ErrorState title="Não foi possível carregar sua fila" error={tarefasQuery.error} onRetry={() => void tarefasQuery.refetch()} />
      ) : tarefasQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Carregando fila de tarefas">
          {[1, 2, 3, 4].map((index) => <Skeleton key={index} className="h-24 rounded-2xl" />)}
        </div>
      ) : groups.total === 0 ? (
        <Card className="rounded-[22px]">
          <CardContent className="py-5">
            <ActionableEmptyState
              title="Sua fila está vazia"
              description="Quando uma tarefa for atribuída a você nesta clínica, ela aparecerá aqui."
              actionLabel="Abrir quadro da equipe"
              onAction={() => navigate('/tarefas')}
              actionIcon={ListTodo}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
            <section aria-labelledby="fila-proxima-title" className="relative overflow-hidden rounded-[24px] bg-[#111111] p-6 text-white shadow-lg">
              <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-gradient-primary opacity-40 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="fila-proxima-title" className="text-xs font-bold uppercase tracking-[0.12em] text-white/70">Próxima tarefa</h2>
                  {proxima && (
                    <span className={cn('rounded-full px-3 py-1 text-[11px] font-bold', groups.overdue.includes(proxima) ? 'bg-destructive text-white' : 'bg-gradient-primary text-white')}>
                      {groups.overdue.includes(proxima) ? 'Atrasada' : groups.today.includes(proxima) ? 'Para hoje' : prioridadeInfo[proxima.prioridade]?.label ?? 'Próxima'}
                    </span>
                  )}
                </div>
                {proxima ? (
                  <>
                    <p className="mt-4 text-2xl font-bold leading-tight sm:text-[28px]">{proxima.titulo}</p>
                    {proxima.descricao && <p className="mt-2 max-w-xl text-sm text-white/65">{proxima.descricao}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/60">
                      {proxima.data_vencimento && <span className="inline-flex items-center gap-1"><CalendarClock aria-hidden="true" className="h-3.5 w-3.5 text-[#2ED5E7]" /> Prazo {format(parseDateOnly(proxima.data_vencimento), 'dd/MM/yyyy')}</span>}
                      {proxima.categoria && <span>{proxima.categoria}</span>}
                      <span>{statusLabel[proxima.status] ?? proxima.status}</span>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {proxima.status === 'pendente' && (
                        <Button type="button" disabled={atualizar.isPending} onClick={() => iniciar(proxima)} aria-label={`Iniciar próxima tarefa: ${proxima.titulo}`} className="h-11 gap-2 rounded-full border border-white/25 bg-white/10 px-5 text-white hover:bg-white/20">
                          <Play aria-hidden="true" className="h-4 w-4" /> Iniciar
                        </Button>
                      )}
                      <Button type="button" disabled={atualizar.isPending} onClick={() => concluir(proxima)} aria-label={`Concluir próxima tarefa: ${proxima.titulo}`} className="h-11 gap-2 rounded-full bg-gradient-primary px-5 text-white shadow-[0_6px_18px_rgba(16,128,202,0.4)] hover:brightness-110">
                        {atualizar.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />} Concluir
                      </Button>
                      <Button type="button" variant="ghost" disabled={atualizar.isPending} onClick={() => adiar(proxima)} aria-label={`Adiar próxima tarefa: ${proxima.titulo}`} className="h-11 gap-2 rounded-full px-4 text-white/80 hover:bg-white/10 hover:text-white">
                        <CalendarPlus aria-hidden="true" className="h-4 w-4" /> Adiar para amanhã
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="mt-5">
                    <Sparkles aria-hidden="true" className="h-8 w-8 text-[#2ED5E7]" />
                    <p className="mt-3 text-xl font-bold">Nada pendente na sua fila</p>
                    <p className="mt-1 text-sm text-white/65">Tudo o que estava atribuído a você já foi resolvido.</p>
                  </div>
                )}
              </div>
            </section>

            <section aria-labelledby="fila-progresso-title" className="rounded-[22px] border border-border/60 bg-card p-5 shadow-xs">
              <h2 id="fila-progresso-title" className="text-base font-bold text-foreground">Progresso do dia</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{concluidasHoje} de {metaDoDia} tarefas do dia concluídas</p>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progresso do dia" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso}>
                <div className="h-full rounded-full bg-gradient-primary transition-[width] duration-500" style={{ width: `${progresso}%` }} />
              </div>
              <p className="mt-2 text-3xl font-light tabular-nums tracking-tight text-foreground">{progresso}%</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl bg-muted/60 p-3">
                  <p className="text-muted-foreground">Em andamento</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-[#1080CA]">{tarefas.filter(t => t.status === 'em_andamento').length}</p>
                </div>
                <div className="rounded-2xl bg-muted/60 p-3">
                  <p className="text-muted-foreground">Abertas</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{activeCount}</p>
                </div>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Resumo da fila">
            {sectionConfig.map(({ key, title, icon: Icon, chip }) => {
              const destaque = key === 'overdue' && groups.overdue.length > 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => irParaSecao(key)}
                  className={cn(
                    'flex min-h-[92px] items-center gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md',
                    destaque ? 'border-transparent bg-[#111111] text-white shadow-md' : 'border-border/60 bg-card shadow-xs hover:border-[#1080CA]/40',
                  )}
                >
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', chip, destaque && 'bg-white/15 text-white')}>
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-xl font-bold tabular-nums">{groups[key].length}</span>
                    <span className={cn('text-xs', destaque ? 'text-white/70' : 'text-muted-foreground')}>{title}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {showingCompletedOnly && (
            <p className="rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-foreground" role="status">
              Tudo em dia: suas atribuições estão concluídas ou canceladas.
            </p>
          )}

          {tarefas.length >= LIMITE_BUSCA_EM_BLOCOS && (
            <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground" role="alert">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              A fila atingiu o limite de tarefas carregadas. Os contadores podem estar incompletos; fale com o suporte da clínica.
            </p>
          )}

          {groups.completed.length > 0 && (
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" aria-pressed={ocultarConcluidas} onClick={() => setOcultarConcluidas(v => !v)} className="h-9 gap-2 rounded-full text-xs">
                {ocultarConcluidas ? <Eye aria-hidden="true" className="h-3.5 w-3.5" /> : <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />}
                {ocultarConcluidas ? 'Mostrar concluídas' : 'Ocultar concluídas'}
              </Button>
            </div>
          )}

          <div className="space-y-5">
            {sectionConfig.map(({ key, title, icon: Icon, tone, chip }) => {
              const sectionTasks = groups[key];
              if (sectionTasks.length === 0 || (key === 'completed' && ocultarConcluidas)) return null;
              return (
                <section key={key} aria-labelledby={`fila-${key}`} className="scroll-mt-24 space-y-3">
                  <h2 id={`fila-${key}`} className={cn('flex items-center gap-2 text-base font-semibold', tone)}>
                    <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', chip)}><Icon aria-hidden="true" className="h-4 w-4" /></span> {title}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{sectionTasks.length}</span>
                  </h2>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {sectionTasks.map((task) => {
                      const pi = prioridadeInfo[task.prioridade] ?? prioridadeInfo.media;
                      const aberta = isOpen(task);
                      return (
                        <Card key={task.id} className={cn('rounded-2xl border-border/60 border-l-4 shadow-xs transition hover:border-[#1080CA]/40 hover:shadow-md', pi.stripe, key === 'overdue' && 'ring-1 ring-destructive/25', !aberta && 'opacity-70')}>
                          <CardContent className="space-y-3 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <p className={cn('text-sm font-semibold leading-snug text-foreground', task.status === 'concluida' && 'text-muted-foreground line-through')}>
                                {task.titulo}
                              </p>
                              <Badge className={cn('shrink-0 border-0', pi.badge)}>{pi.label}</Badge>
                            </div>
                            {task.descricao && <p className="text-xs leading-relaxed text-muted-foreground">{task.descricao}</p>}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className={cn(task.status === 'em_andamento' && 'border-[#1080CA]/30 bg-[#1080CA]/10 text-[#1080CA]', task.status === 'concluida' && 'border-success/30 bg-success/10 text-success')}>{statusLabel[task.status] ?? task.status}</Badge>
                              {task.data_vencimento && <span className="inline-flex items-center gap-1"><CalendarClock aria-hidden="true" className="h-3.5 w-3.5" /> {format(parseDateOnly(task.data_vencimento), 'dd/MM/yyyy')}</span>}
                              {task.categoria && <span>{task.categoria}</span>}
                              {task.paciente_id && (canOpenPatient ? (
                                <Link
                                  to={`/pacientes?paciente=${encodeURIComponent(task.paciente_id)}`}
                                  className="inline-flex min-h-11 items-center gap-1 text-[#1080CA] hover:underline"
                                >
                                  <UserRound aria-hidden="true" className="h-3.5 w-3.5" /> Abrir paciente
                                </Link>
                              ) : <span className="inline-flex min-h-11 items-center gap-1"><UserRound aria-hidden="true" className="h-3.5 w-3.5" /> Paciente vinculado</span>)}
                            </div>
                            {aberta && (
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                {task.status === 'pendente' && (
                                  <Button type="button" variant="outline" size="sm" className="min-h-10 gap-2 rounded-full" disabled={atualizar.isPending} onClick={() => iniciar(task)} aria-label={`Iniciar tarefa ${task.titulo}`}>
                                    <Play aria-hidden="true" className="h-4 w-4" /> Iniciar
                                  </Button>
                                )}
                                <Button type="button" size="sm" className="min-h-10 gap-2 rounded-full bg-gradient-primary text-white hover:brightness-110" disabled={atualizar.isPending} onClick={() => concluir(task)} aria-label={`Concluir tarefa ${task.titulo}`}>
                                  {atualizar.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />} Concluir
                                </Button>
                                <Button type="button" variant="ghost" size="sm" className="min-h-10 gap-2 rounded-full text-muted-foreground" disabled={atualizar.isPending} onClick={() => adiar(task)} aria-label={`Adiar tarefa ${task.titulo} para amanhã`}>
                                  <CalendarPlus aria-hidden="true" className="h-4 w-4" /> Adiar
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
