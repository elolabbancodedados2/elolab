import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, CalendarClock, Check, Circle, Clock3, ListTodo, Loader2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ActionableEmptyState } from '@/components/ActionableEmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { formatWithDatePreference as format } from '@/lib/datePreference';
import { logAudit } from '@/lib/auditTrail';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { withSafeRetry } from '@/lib/retry';
import { cn } from '@/lib/utils';
import { groupPersonalTasks, PersonalTask, PersonalTaskGroups } from './personalTaskQueue';

const EMPTY_TASKS: PersonalTask[] = [];

const sectionConfig: Array<{
  key: keyof Pick<PersonalTaskGroups, 'overdue' | 'today' | 'upcoming' | 'noDeadline' | 'completed'>;
  title: string;
  icon: typeof Circle;
  tone: string;
}> = [
  { key: 'overdue', title: 'Atrasadas', icon: AlertTriangle, tone: 'text-destructive' },
  { key: 'today', title: 'Para hoje', icon: Clock3, tone: 'text-warning-foreground' },
  { key: 'upcoming', title: 'Próximas', icon: CalendarClock, tone: 'text-primary' },
  { key: 'noDeadline', title: 'Sem prazo', icon: Circle, tone: 'text-muted-foreground' },
  { key: 'completed', title: 'Concluídas e canceladas', icon: Check, tone: 'text-success' },
];

const statusLabel: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const priorityVariant: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  urgente: 'destructive',
  alta: 'destructive',
  media: 'secondary',
  baixa: 'outline',
};

export default function MinhaFilaTarefas() {
  const { user, profile, isAdmin, hasRole } = useSupabaseAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const today = todaySaoPauloDateOnly(now);
  const clinicaId = profile?.clinica_id;
  const userId = user?.id;
  const canOpenPatient = isAdmin() || hasRole('recepcao') || hasRole('enfermagem');

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

  const concluirTarefa = useMutation({
    mutationFn: async (task: PersonalTask) => {
      if (!clinicaId || !userId) throw new Error('Sua sessão expirou. Entre novamente para concluir a tarefa.');
      const { data, error } = await supabase
        .from('tarefas')
        .update({ status: 'concluida' })
        .eq('id', task.id)
        .eq('clinica_id', clinicaId)
        .eq('responsavel_id', userId)
        .eq('updated_at', task.updated_at)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Esta tarefa mudou desde a última atualização. Recarregue a fila e tente novamente.');
      await logAudit({
        action: 'update',
        collection: 'tarefas',
        recordId: task.id,
        userId,
        changes: [{ field: 'status', oldValue: task.status, newValue: 'concluida' }],
      });
      return task.id;
    },
    onSuccess: async () => {
      toast.success('Tarefa concluída');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['minha-fila-tarefas', clinicaId, userId] }),
        queryClient.invalidateQueries({ queryKey: ['tarefas'] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível concluir a tarefa'),
  });

  const activeCount = groups.overdue.length + groups.today.length + groups.upcoming.length + groups.noDeadline.length;
  const showingCompletedOnly = groups.total > 0 && activeCount === 0;

  return (
    <div className="space-y-5 pb-8">
      <section className="relative isolate overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-card via-card to-primary/5 p-5 shadow-sm sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-16 h-52 w-52 rounded-full border-[26px] border-primary/15" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Sua rotina</p>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              <ListTodo aria-hidden="true" className="h-6 w-6 text-primary" /> Minha fila de trabalho
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Tarefas atribuídas a você, organizadas por prazo.</p>
          </div>
          <Button asChild variant="outline" className="h-11 gap-2">
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
        <Card>
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Resumo da fila">
            {sectionConfig.map(({ key, title, icon: Icon, tone }) => (
              <Card key={key} className="min-h-[92px]">
                <CardContent className="flex h-full items-center gap-3 p-4">
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70', tone)}>
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-xl font-bold tabular-nums text-foreground">{groups[key].length}</span>
                    <span className="text-xs text-muted-foreground">{title}</span>
                  </span>
                </CardContent>
              </Card>
            ))}
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

          <div className="space-y-5">
            {sectionConfig.map(({ key, title, icon: Icon, tone }) => {
              const sectionTasks = groups[key];
              if (sectionTasks.length === 0) return null;
              return (
                <section key={key} aria-labelledby={`fila-${key}`} className="space-y-3">
                  <h2 id={`fila-${key}`} className={cn('flex items-center gap-2 text-base font-semibold', tone)}>
                    <Icon aria-hidden="true" className="h-4 w-4" /> {title}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{sectionTasks.length}</span>
                  </h2>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {sectionTasks.map((task) => {
                      const canComplete = task.status !== 'concluida' && task.status !== 'cancelada';
                      return (
                        <Card key={task.id} className={cn('border-border/80', key === 'overdue' && 'border-destructive/30')}>
                          <CardHeader className="space-y-2 p-4 pb-2">
                            <div className="flex items-start justify-between gap-3">
                              <CardTitle className={cn('text-sm leading-snug', task.status === 'concluida' && 'text-muted-foreground line-through')}>
                                {task.titulo}
                              </CardTitle>
                              <Badge variant={priorityVariant[task.prioridade] ?? 'outline'} className="shrink-0 capitalize">
                                {task.prioridade}
                              </Badge>
                            </div>
                            {task.descricao && <p className="text-xs leading-relaxed text-muted-foreground">{task.descricao}</p>}
                          </CardHeader>
                          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 pt-2">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                              <Badge variant="outline">{statusLabel[task.status] ?? task.status}</Badge>
                              {task.data_vencimento && <span>Prazo: {format(parseDateOnly(task.data_vencimento), 'dd/MM/yyyy')}</span>}
                              {task.categoria && <span>{task.categoria}</span>}
                              {task.paciente_id && (canOpenPatient ? (
                                <Link
                                  to={`/pacientes?paciente=${encodeURIComponent(task.paciente_id)}`}
                                  className="inline-flex min-h-11 items-center gap-1 text-primary hover:underline"
                                >
                                  <UserRound aria-hidden="true" className="h-3.5 w-3.5" /> Abrir paciente
                                </Link>
                              ) : <span className="inline-flex min-h-11 items-center gap-1"><UserRound aria-hidden="true" className="h-3.5 w-3.5" /> Paciente vinculado</span>)}
                            </div>
                            {canComplete && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="min-h-11 gap-2"
                                disabled={concluirTarefa.isPending}
                                onClick={() => concluirTarefa.mutate(task)}
                                aria-label={`Concluir tarefa ${task.titulo}`}
                              >
                                {concluirTarefa.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                                Concluir
                              </Button>
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
