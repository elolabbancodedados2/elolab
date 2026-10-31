import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, FileBarChart, Loader2, Pause, Play, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';
import { cn } from '@/lib/utils';

type ScheduleFilter = 'todos' | 'ativos' | 'pausados' | 'falha';

type Frequency = 'daily' | 'weekly' | 'monthly';
type Schedule = {
  id: string;
  name: string;
  recipients: string[];
  frequency: Frequency;
  active: boolean;
  next_run_at: string;
  last_run_at: string | null;
};
type ReportRun = { id: string; schedule_id: string; status: 'success' | 'error'; recipients_count: number; error: string | null; created_at: string };

const frequencyLabels: Record<Frequency, string> = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' };

function dateTime(value: string | null) {
  if (!value) return 'Ainda não executado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
}

function parseRecipients(value: string) {
  const entries = value.split(',').map((email) => email.trim()).filter(Boolean);
  const unique = [...new Map(entries.map((email) => [email.toLocaleLowerCase('pt-BR'), email])).values()];
  const invalid = unique.filter((email) => !/^[^\s@,]+@[^\s@,]+\.[^\s@.,]+$/.test(email));
  return { recipients: unique, invalid };
}

export default function PlatformRelatoriosAgendados() {
  const queryClient = useQueryClient();
  const addLock = useRef(false);
  const toggleLock = useRef(false);
  const runLock = useRef(false);
  const [name, setName] = useState('Resumo executivo EloLab');
  const [recipientsInput, setRecipientsInput] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [scheduleToRun, setScheduleToRun] = useState<Schedule | null>(null);
  const [filter, setFilter] = useState<ScheduleFilter>('todos');
  const parsed = useMemo(() => parseRecipients(recipientsInput), [recipientsInput]);

  const schedules = useQuery({
    queryKey: ['platform-report-schedules'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('platform_report_schedules').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Schedule[];
    },
    refetchInterval: 60_000,
  });

  const runs = useQuery({
    queryKey: ['platform-report-runs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('platform_report_runs').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data || []) as ReportRun[];
    },
    refetchInterval: 60_000,
  });

  const invalidateReports = () => {
    void queryClient.invalidateQueries({ queryKey: ['platform-report-schedules'] });
    void queryClient.invalidateQueries({ queryKey: ['platform-report-runs'] });
  };

  const addSchedule = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('platform_report_schedules').insert({
        name: name.trim(), recipients: parsed.recipients, frequency,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setRecipientsInput('');
      toast.success('Relatório agendado.');
      invalidateReports();
    },
    onError: (error) => toast.error('Não foi possível criar o agendamento.', { description: mensagemDeErro(error) }),
    onSettled: () => { addLock.current = false; },
  });

  const setScheduleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { data, error } = await (supabase as any).from('platform_report_schedules').update({ active }).eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Agendamento não encontrado ou sem permissão para alterar.');
    },
    onSuccess: (_result, variables) => {
      toast.success(variables.active ? 'Agendamento reativado.' : 'Agendamento pausado.');
      invalidateReports();
    },
    onError: (error) => toast.error('Não foi possível alterar o agendamento.', { description: mensagemDeErro(error) }),
    onSettled: () => { toggleLock.current = false; },
  });

  const runNow = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('platform-reports-runner', { body: { id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const result = (data?.results || []).find((item: { schedule_id: string }) => item.schedule_id === id);
      if (!result) throw new Error('O serviço não confirmou a execução deste agendamento. Atualize o histórico para conferir.');
      return result as { schedule_id: string; status: 'success' | 'error'; error?: string; warning?: string };
    },
    onSuccess: (result) => {
      if (result.status === 'error') toast.error('O relatório não foi enviado.', { description: [result.error || 'Confira a execução registrada e tente novamente.', result.warning].filter(Boolean).join(' ') });
      else if (result.warning) toast.warning('O e-mail foi enviado, mas o histórico ficou incompleto.', { description: result.warning });
      else toast.success('Relatório enviado com sucesso.');
      invalidateReports();
    },
    onError: (error) => toast.error('Falha ao executar o relatório.', { description: mensagemDeErro(error) }),
    onSettled: () => { runLock.current = false; },
  });

  const submitSchedule = () => {
    if (!formValid || addLock.current) return;
    addLock.current = true;
    addSchedule.mutate();
  };
  const toggleSchedule = (id: string, active: boolean) => {
    if (toggleLock.current) return;
    toggleLock.current = true;
    setScheduleActive.mutate({ id, active });
  };
  const executeSchedule = (id: string) => {
    if (runLock.current) return;
    runLock.current = true;
    runNow.mutate(id);
  };

  const formValid = name.trim().length >= 3 && name.trim().length <= 120 && parsed.recipients.length >= 1 && parsed.recipients.length <= 20 && parsed.invalid.length === 0;
  const runsBySchedule = useMemo(() => (runs.data || []).reduce<Record<string, ReportRun[]>>((groups, run) => {
    (groups[run.schedule_id] ||= []).push(run);
    return groups;
  }, {}), [runs.data]);
  const allSchedules = schedules.data ?? [];
  const lastFailed = (schedule: Schedule) => runsBySchedule[schedule.id]?.[0]?.status === 'error';
  const matches = (schedule: Schedule, value: ScheduleFilter) =>
    value === 'todos' || (value === 'ativos' ? schedule.active : value === 'pausados' ? !schedule.active : lastFailed(schedule));
  const visibleSchedules = allSchedules.filter((schedule) => matches(schedule, filter));
  const kpis: Array<{ value: ScheduleFilter; label: string; detail: string; icon: typeof Play; color: string }> = [
    { value: 'todos', label: 'Agendamentos', detail: 'cadastrados', icon: CalendarClock, color: '' },
    { value: 'ativos', label: 'Ativos', detail: 'enviam automaticamente', icon: Play, color: 'bg-success/10 text-success' },
    { value: 'pausados', label: 'Pausados', detail: 'sem envio automático', icon: Pause, color: 'bg-muted text-muted-foreground' },
    { value: 'falha', label: 'Última execução falhou', detail: 'precisam de revisão', icon: AlertTriangle, color: 'bg-destructive/10 text-destructive' },
  ];
  const countOf = (value: ScheduleFilter) => allSchedules.filter((schedule) => matches(schedule, value)).length;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <PageHeader
        title="Relatórios agendados"
        icon={<FileBarChart />}
        description={allSchedules.length
          ? `${allSchedules.length} agendamentos · ${countOf('ativos')} ativos · ${countOf('falha')} com falha na última execução. Dados agregados, sem dados clínicos.`
          : 'O resumo executivo inclui dados agregados da plataforma e não contém dados clínicos.'}
        actions={<>
          <Button asChild variant="outline" className="gap-2 rounded-full">
            <Link to="/admin/relatorio-executivo"><FileBarChart className="h-4 w-4" />Ver relatório</Link>
          </Button>
          <Button type="button" variant="outline" size="icon" className="rounded-full" onClick={invalidateReports} disabled={schedules.isFetching || runs.isFetching} aria-label="Atualizar dados">
            <RefreshCw className={cn('h-4 w-4', (schedules.isFetching || runs.isFetching) && 'animate-spin')} />
          </Button>
        </>}
      />

      {allSchedules.length > 0 && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Indicadores de agendamentos">
          {kpis.map(({ value, label, detail, icon: Icon, color }) => {
            const highlight = value === 'todos';
            return (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  'rounded-2xl border border-border/60 bg-card p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  highlight && 'border-transparent bg-gradient-primary text-white',
                  filter === value && !highlight && 'border-primary ring-1 ring-primary/30',
                  filter === value && highlight && 'ring-2 ring-primary/40 ring-offset-2',
                )}
              >
                <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', highlight ? 'bg-white/20 text-white' : color)}><Icon className="h-5 w-5" /></span>
                <p className="mt-3 text-2xl font-bold tabular-nums">{countOf(value)}</p>
                <p className={cn('text-sm font-medium', highlight ? 'text-white' : 'text-foreground')}>{label}</p>
                <p className={cn('text-[11px]', highlight ? 'text-white/70' : 'text-muted-foreground')}>{detail}</p>
              </button>
            );
          })}
        </section>
      )}

      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader>
          <CardTitle>Novo agendamento</CardTitle>
          <CardDescription>Informe até 20 e-mails separados por vírgula. Todos precisam ser válidos. A frequência mensal mantém o dia do calendário em que o agendamento foi criado.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_minmax(18rem,2fr)_12rem_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="report-name">Nome do relatório</Label>
            <Input id="report-name" value={name} maxLength={120} disabled={addSchedule.isPending} onChange={(event) => setName(event.target.value)} placeholder="Resumo executivo EloLab" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-recipients">Destinatários</Label>
            <Input id="report-recipients" type="text" inputMode="email" value={recipientsInput} disabled={addSchedule.isPending} onChange={(event) => setRecipientsInput(event.target.value)} placeholder="diretoria@empresa.com, financeiro@empresa.com" />
            {parsed.invalid.length > 0 && <p role="alert" className="text-xs text-destructive">E-mail inválido: {parsed.invalid.join(', ')}</p>}
            {parsed.recipients.length > 20 && <p role="alert" className="text-xs text-destructive">O limite é de 20 destinatários. Remova {parsed.recipients.length - 20} e-mail(s).</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-frequency">Frequência</Label>
            <Select value={frequency} onValueChange={(value) => setFrequency(value as Frequency)} disabled={addSchedule.isPending}>
              <SelectTrigger id="report-frequency"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diário</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="min-h-11 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" onClick={submitSchedule} disabled={!formValid || addSchedule.isPending}>
            {addSchedule.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Agendar
          </Button>
        </CardContent>
      </Card>

      <section aria-label="Agendamentos existentes" className="space-y-3">
        {allSchedules.length > 0 && (
          <div className="flex items-center justify-end gap-2">
            {filter !== 'todos' && <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setFilter('todos')}>Limpar filtros</Button>}
            <span className="text-xs text-muted-foreground" aria-live="polite">{visibleSchedules.length} de {allSchedules.length}</span>
          </div>
        )}
        {schedules.isLoading ? (
          [1, 2].map((item) => <Skeleton key={item} className="h-52 w-full rounded-2xl" />)
        ) : schedules.isError ? (
          <Card className="rounded-2xl border-destructive/30 shadow-xs"><CardContent className="py-6" role="alert">
            <p className="font-medium">Não foi possível carregar os agendamentos.</p>
            <p className="mt-1 text-sm text-muted-foreground">{mensagemDeErro(schedules.error)}</p>
            <Button className="mt-3 rounded-full" variant="outline" onClick={() => void schedules.refetch()}>Tentar novamente</Button>
          </CardContent></Card>
        ) : allSchedules.length ? (
          visibleSchedules.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhum agendamento neste filtro.</p>
          ) : visibleSchedules.map((schedule) => {
            const recentRuns = runsBySchedule[schedule.id]?.slice(0, 3) || [];
            const isRunning = runNow.isPending && runNow.variables === schedule.id;
            const isToggling = setScheduleActive.isPending && setScheduleActive.variables?.id === schedule.id;
            const lastAttemptAt = recentRuns[0]?.created_at || schedule.last_run_at;
            const nextRunTime = new Date(schedule.next_run_at).getTime();
            const nextRunLabel = !schedule.active
              ? 'Pausado'
              : Number.isFinite(nextRunTime) && nextRunTime <= Date.now()
                ? 'Aguardando tentativa automática (verificação horária)'
                : dateTime(schedule.next_run_at);
            return (
              <Card key={schedule.id} className={cn('rounded-2xl border-border/60 shadow-xs', lastFailed(schedule) && 'border-destructive/40')}>
                <CardContent className="space-y-4 pt-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{schedule.name}</h2>
                        <Badge variant={schedule.active ? 'default' : 'secondary'} className={cn('rounded-full', schedule.active && 'border-transparent bg-gradient-primary text-white')}>{schedule.active ? 'Ativo' : 'Pausado'}</Badge>
                        <Badge variant="outline" className="rounded-full border-border text-primary">{frequencyLabels[schedule.frequency] || schedule.frequency}</Badge>
                      </div>
                      <p className="break-words text-sm text-muted-foreground">{schedule.recipients.join(', ')}</p>
                      <p className="text-xs text-muted-foreground">Próxima execução: {nextRunLabel} · Última tentativa: {dateTime(lastAttemptAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button className="h-9 rounded-full text-xs" variant="outline" onClick={() => toggleSchedule(schedule.id, !schedule.active)} disabled={isToggling || setScheduleActive.isPending}>
                        {isToggling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : schedule.active ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                        {schedule.active ? 'Pausar' : 'Reativar'}
                      </Button>
                      <Button className="h-9 rounded-full bg-primary text-xs text-white hover:brightness-110" onClick={() => setScheduleToRun(schedule)} disabled={!schedule.active || isRunning || runNow.isPending}>
                        {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        Executar agora
                      </Button>
                    </div>
                  </div>

                  <div className="border-t border-border/60 pt-3">
                    <h3 className="mb-2 text-sm font-medium">Execuções recentes</h3>
                    {runs.isLoading ? (
                      <Skeleton className="h-12 w-full" />
                    ) : runs.isError ? (
                      <p className="text-sm text-destructive">Não foi possível carregar o histórico de execuções. {mensagemDeErro(runs.error)}</p>
                    ) : recentRuns.length ? (
                      <ul className="space-y-2">
                        {recentRuns.map((run) => (
                          <li key={run.id} className="flex flex-col gap-2 rounded-xl bg-secondary p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={run.status === 'success' ? 'outline' : 'destructive'} className={cn('rounded-full', run.status === 'success' && 'border-success/40 text-success')}>{run.status === 'success' ? 'Enviado' : 'Falhou'}</Badge>
                              <span className="text-xs text-muted-foreground">{dateTime(run.created_at)} · {run.recipients_count} destinatário(s)</span>
                            </div>
                            {run.error && <p className="break-words text-xs text-destructive">{run.error}</p>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Ainda não há execuções registradas.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="flex flex-col items-center py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><FileBarChart className="h-6 w-6" /></span>
            <p className="mt-3 font-medium text-foreground">Nenhum relatório agendado</p>
            <p className="mt-1 text-sm text-muted-foreground">Crie um agendamento para enviar resumos executivos automaticamente.</p>
            <Button type="button" variant="outline" className="mt-4 rounded-full" onClick={() => document.getElementById('report-recipients')?.focus()}>Informar destinatários</Button>
          </CardContent></Card>
        )}
      </section>
      {runs.data?.length === 200 && <p role="status" className="text-xs text-muted-foreground">O histórico mostra as 200 execuções mais recentes da plataforma; execuções mais antigas podem não aparecer.</p>}

      <AlertDialog open={!!scheduleToRun} onOpenChange={(open) => !open && !runNow.isPending && setScheduleToRun(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar relatório agora?</AlertDialogTitle>
            <AlertDialogDescription>
              {scheduleToRun && <>
                “{scheduleToRun.name}” será enviado agora para {scheduleToRun.recipients.length} destinatário(s): {scheduleToRun.recipients.join(', ')}.
                {' '}Depois do envio, o próximo horário automático será recalculado conforme a frequência {frequencyLabels[scheduleToRun.frequency].toLowerCase()}.
                {' '}O resumo contém dados agregados da plataforma, sem dados clínicos.
              </>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={runNow.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-gradient-primary text-white hover:brightness-110"
              onClick={(event) => {
                event.preventDefault();
                if (!scheduleToRun || runNow.isPending) return;
                executeSchedule(scheduleToRun.id);
                setScheduleToRun(null);
              }}
              disabled={runNow.isPending}
            >
              {runNow.isPending ? 'Enviando…' : 'Confirmar envio'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
