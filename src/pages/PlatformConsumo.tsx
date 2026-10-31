import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, Gauge, Loader2, Pencil, RefreshCw, Save, Search, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';
import { cn } from '@/lib/utils';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';

type Clinic = {
  clinica_id: string;
  clinica_nome: string;
  max_users: number;
  users_used: number;
  max_ai_tokens: number;
  ai_tokens_used: number;
  max_notifications: number;
  notifications_used: number;
};
type UsageOverview = { generated_at: string; clinics: Clinic[] };

type LimitForm = { clinic: Clinic; max_users: string; max_ai_tokens: string; max_notifications: string };
type Limits = Pick<Clinic, 'max_users' | 'max_ai_tokens' | 'max_notifications'>;
type UsageListState = { busca?: string; filtro?: UsageStatus | 'todas' };

function percentage(used: number, limit: number) {
  if (limit === 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function numberLabel(value: number) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function isValidLimit(value: string, minimum: number) {
  const number = Number(value);
  return value.trim() !== '' && Number.isSafeInteger(number) && number >= minimum && number <= 2_147_483_647;
}

type UsageStatus = 'acima' | 'perto' | 'ok';
function usageStatus(clinic: Clinic): UsageStatus {
  const pairs: Array<[number, number]> = [
    [clinic.users_used, clinic.max_users],
    [clinic.ai_tokens_used, clinic.max_ai_tokens],
    [clinic.notifications_used, clinic.max_notifications],
  ];
  if (pairs.some(([used, limit]) => used > limit)) return 'acima';
  return pairs.some(([used, limit]) => percentage(used, limit) >= 80) ? 'perto' : 'ok';
}

function dateTimeLabel(value?: string) {
  if (!value) return 'indisponível';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'indisponível' : date.toLocaleString('pt-BR');
}

export default function PlatformConsumo() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { clinicId } = useParams();
  const listState = location.state as UsageListState | null;
  const [form, setForm] = useState<LimitForm | null>(null);
  const [busca, setBusca] = useState(listState?.busca ?? '');
  const [filtro, setFiltro] = useState<UsageStatus | 'todas'>(listState?.filtro ?? 'todas');
  const [formClinicId, setFormClinicId] = useState<string | null>(null);
  const saveLock = useRef(false);
  const completed = useRef(false);
  const initializedClinic = useRef<string | null>(null);
  const baseline = useRef('');

  const currentListState = () => ({ busca, filtro });
  const returnToList = () => navigate('/admin/consumo', { state: currentListState() });

  const usage = useQuery({
    queryKey: ['platform-usage'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_usage_overview');
      if (error) throw error;
      return data as UsageOverview;
    },
    refetchInterval: 60_000,
  });

  const clinics = usage.data?.clinics ?? [];
  const selectedClinic = clinicId ? clinics.find(clinic => clinic.clinica_id === clinicId) ?? null : null;

  useEffect(() => {
    if (!clinicId) {
      initializedClinic.current = null;
      baseline.current = '';
      completed.current = false;
      setForm(null);
      setFormClinicId(null);
      return;
    }
    if (!usage.data || initializedClinic.current === clinicId) return;
    initializedClinic.current = clinicId;
    const clinic = usage.data.clinics.find(item => item.clinica_id === clinicId);
    if (!clinic) {
      setForm(null);
      return;
    }
    const initialForm = {
      clinic,
      max_users: String(clinic.max_users),
      max_ai_tokens: String(clinic.max_ai_tokens),
      max_notifications: String(clinic.max_notifications),
    };
    baseline.current = JSON.stringify({ max_users: initialForm.max_users, max_ai_tokens: initialForm.max_ai_tokens, max_notifications: initialForm.max_notifications });
    completed.current = false;
    setForm(initialForm);
    setFormClinicId(clinicId);
  }, [clinicId, usage.data]);

  const currentForm = JSON.stringify(form ? { max_users: form.max_users, max_ai_tokens: form.max_ai_tokens, max_notifications: form.max_notifications } : null);
  const dirty = Boolean(clinicId && formClinicId === clinicId && baseline.current !== currentForm);
  const openEditor = (clinic: Clinic) => {
    navigate(`/admin/consumo/${encodeURIComponent(clinic.clinica_id)}/limites`, { state: currentListState() });
  };

  const saveLimits = useMutation({
    mutationFn: async (values: Limits & { clinica_id: string }) => {
      const { error } = await (supabase as any).rpc('platform_set_tenant_limits', {
        p_clinica_id: values.clinica_id,
        p_max_users: values.max_users,
        p_max_ai_tokens: values.max_ai_tokens,
        p_max_notifications: values.max_notifications,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      completed.current = true;
      toast.success('Limites atualizados.');
      void queryClient.invalidateQueries({ queryKey: ['platform-usage'] });
      returnToList();
    },
    onError: (error) => toast.error('Não foi possível salvar os limites.', { description: mensagemDeErro(error) }),
    onSettled: () => { saveLock.current = false; },
  });

  const parsed = form ? {
    max_users: Number(form.max_users),
    max_ai_tokens: Number(form.max_ai_tokens),
    max_notifications: Number(form.max_notifications),
  } : null;
  const formValid = !!form && !!parsed && isValidLimit(form.max_users, 1) && isValidLimit(form.max_ai_tokens, 0) && isValidLimit(form.max_notifications, 0);
  const usageForForm = clinicId && selectedClinic ? selectedClinic : form?.clinic;
  const limitsBelowUsage = form && parsed && usageForForm ? [
    parsed.max_users < usageForForm.users_used ? 'assentos de usuários' : null,
    parsed.max_ai_tokens < usageForForm.ai_tokens_used ? 'tokens de IA do mês' : null,
    parsed.max_notifications < usageForForm.notifications_used ? 'notificações do mês' : null,
  ].filter((item): item is string => item !== null) : [];

  const editField = (field: keyof Limits, value: string) => setForm((current) => current ? { ...current, [field]: value } : current);
  const save = () => {
    if (!form || !parsed || !formValid || saveLock.current) return;
    saveLock.current = true;
    saveLimits.mutate({ clinica_id: form.clinic.clinica_id, ...parsed });
  };
  const counts = clinics.reduce((acc, clinic) => ({ ...acc, [usageStatus(clinic)]: acc[usageStatus(clinic)] + 1 }), { acima: 0, perto: 0, ok: 0 } as Record<UsageStatus, number>);
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const visibleClinics = clinics.filter((clinic) =>
    (filtro === 'todas' || usageStatus(clinic) === filtro) &&
    (!termo || clinic.clinica_nome.toLocaleLowerCase('pt-BR').includes(termo)));
  const hasFilter = filtro !== 'todas' || !!termo;
  const clearFilters = () => { setFiltro('todas'); setBusca(''); };
  const kpis = [
    { value: 'todas' as const, label: 'Clínicas monitoradas', count: clinics.length, detail: 'com cotas configuradas', icon: Building2, color: '' },
    { value: 'acima' as const, label: 'Acima do limite', count: counts.acima, detail: 'consumo maior que a cota', icon: AlertTriangle, color: 'bg-destructive/10 text-destructive' },
    { value: 'perto' as const, label: 'Perto do limite', count: counts.perto, detail: '80% ou mais de alguma cota', icon: TrendingUp, color: 'bg-warning/10 text-warning' },
    { value: 'ok' as const, label: 'Dentro do limite', count: counts.ok, detail: 'abaixo de 80% em todas', icon: CheckCircle2, color: 'bg-success/10 text-success' },
  ];

  const Metric = ({ label, used, limit }: { label: string; used: number; limit: number }) => {
    const percent = percentage(used, limit);
    const reached = used >= limit && limit > 0;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-1 text-sm">
          <span>{label}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{numberLabel(used)} / {numberLabel(limit)}</span>
        </div>
        <Progress value={percent} aria-label={`${label}: ${numberLabel(used)} usados de ${numberLabel(limit)}`} />
        {used > limit && <p className="text-xs font-medium text-destructive">Acima do limite por {numberLabel(used - limit)}.</p>}
        {limit === 0 && <p className="text-xs text-muted-foreground">Cota zerada para este ciclo.</p>}
        {reached && used === limit && <p className="text-xs text-warning">Limite atingido.</p>}
      </div>
    );
  };

  if (clinicId) {
    if (usage.isLoading || (selectedClinic && formClinicId !== clinicId)) {
      return <main className="mx-auto w-full max-w-4xl space-y-5 pb-36"><PageHeader title="Limites da clínica" description="Carregando consumo e cotas atuais." icon={<Gauge />} /><Skeleton className="h-80 w-full rounded-xl" /></main>;
    }
    if (usage.isError) {
      return (
        <main className="mx-auto w-full max-w-4xl space-y-5 pb-24">
          <PageHeader title="Limites indisponíveis" description="Não foi possível carregar os dados de consumo." icon={<Gauge />} actions={<Button variant="outline" onClick={returnToList}><ArrowLeft className="mr-2 h-4 w-4" />Voltar à lista</Button>} />
          <Alert variant="destructive"><AlertTitle>Dados indisponíveis</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{mensagemDeErro(usage.error)}</span><Button variant="outline" size="sm" onClick={() => void usage.refetch()} disabled={usage.isFetching}>Tentar novamente</Button></AlertDescription></Alert>
        </main>
      );
    }
    if (!selectedClinic || !form) {
      return <main className="mx-auto w-full max-w-4xl space-y-5 pb-24"><PageHeader title="Clínica não encontrada" description="Esta clínica não aparece no resumo de consumo da plataforma." icon={<Gauge />} actions={<Button variant="outline" onClick={returnToList}><ArrowLeft className="mr-2 h-4 w-4" />Voltar à lista</Button>} /></main>;
    }

    return (
      <main className="mx-auto w-full max-w-4xl space-y-6 pb-36 sm:pb-10">
        <UnsavedChangesGuard dirty={dirty} busy={saveLimits.isPending} completed={completed} />
        <PageHeader
          title="Editar limites"
          description={`${selectedClinic.clinica_nome} · Revise o consumo atual antes de alterar as cotas.`}
          icon={<Gauge />}
          actions={<Button variant="outline" onClick={returnToList}><ArrowLeft className="mr-2 h-4 w-4" />Voltar à lista</Button>}
        />

        <section aria-label="Consumo atual da clínica" className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="font-semibold">Consumo deste mês</h2><p className="mt-1 text-xs text-muted-foreground">Atualizado em {dateTimeLabel(usage.data?.generated_at)}.</p></div>
            <Button type="button" variant="ghost" size="sm" onClick={() => void usage.refetch()} disabled={usage.isFetching} aria-label="Atualizar consumo"><RefreshCw className={cn('mr-2 h-4 w-4', usage.isFetching && 'animate-spin')} />Atualizar</Button>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            <Metric label="Assentos contabilizados" used={selectedClinic.users_used} limit={selectedClinic.max_users} />
            <Metric label="Tokens de IA" used={selectedClinic.ai_tokens_used} limit={selectedClinic.max_ai_tokens} />
            <Metric label="Notificações" used={selectedClinic.notifications_used} limit={selectedClinic.max_notifications} />
          </div>
        </section>

        <section aria-label="Alterar cotas da clínica" className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <h2 className="font-semibold">Novos limites</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use números inteiros. O limite de usuários precisa ser pelo menos 1; tokens e notificações podem ser zerados.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="limit-users">Assentos de usuários</Label>
              <Input id="limit-users" type="number" inputMode="numeric" min={1} max={2_147_483_647} step={1} value={form.max_users} onChange={(event) => editField('max_users', event.target.value)} disabled={saveLimits.isPending} aria-invalid={!isValidLimit(form.max_users, 1)} />
              {!isValidLimit(form.max_users, 1) && <p role="alert" className="text-xs text-destructive">Informe um número inteiro entre 1 e 2.147.483.647.</p>}
              <p className="text-xs text-muted-foreground">Contas contabilizadas: {numberLabel(selectedClinic.users_used)}. Bloquear o login não libera um assento automaticamente.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit-ai">Tokens de IA por mês</Label>
              <Input id="limit-ai" type="number" inputMode="numeric" min={0} max={2_147_483_647} step={1} value={form.max_ai_tokens} onChange={(event) => editField('max_ai_tokens', event.target.value)} disabled={saveLimits.isPending} aria-invalid={!isValidLimit(form.max_ai_tokens, 0)} />
              {!isValidLimit(form.max_ai_tokens, 0) && <p role="alert" className="text-xs text-destructive">Informe um número inteiro entre 0 e 2.147.483.647.</p>}
              <p className="text-xs text-muted-foreground">Atualmente em uso: {numberLabel(selectedClinic.ai_tokens_used)}</p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="limit-notifications">Notificações por mês</Label>
              <Input id="limit-notifications" type="number" inputMode="numeric" min={0} max={2_147_483_647} step={1} value={form.max_notifications} onChange={(event) => editField('max_notifications', event.target.value)} disabled={saveLimits.isPending} aria-invalid={!isValidLimit(form.max_notifications, 0)} />
              {!isValidLimit(form.max_notifications, 0) && <p role="alert" className="text-xs text-destructive">Informe um número inteiro entre 0 e 2.147.483.647.</p>}
              <p className="text-xs text-muted-foreground">Atualmente em uso: {numberLabel(selectedClinic.notifications_used)}</p>
            </div>
          </div>
          {limitsBelowUsage.length > 0 && <Alert className="mt-5 border-warning/40 bg-warning/10 text-foreground"><AlertTriangle className="h-4 w-4 text-warning" /><AlertTitle>O limite ficará abaixo do consumo atual</AlertTitle><AlertDescription className="space-y-1"><p>Afetará: {limitsBelowUsage.join(', ')}.</p>{limitsBelowUsage.includes('assentos de usuários') && <p>A cota de assentos não é mensal. Peça ao suporte para revisar as contas contabilizadas ou o limite.</p>}{(limitsBelowUsage.includes('tokens de IA do mês') || limitsBelowUsage.includes('notificações do mês')) && <p>Cotas de IA e notificações podem bloquear novos usos até o próximo mês ou até que o limite seja ampliado.</p>}</AlertDescription></Alert>}
          <footer className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={returnToList} disabled={saveLimits.isPending}>Cancelar</Button>
            <Button onClick={save} disabled={!formValid || saveLimits.isPending || formClinicId !== clinicId}>
              {saveLimits.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar limites
            </Button>
          </footer>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <PageHeader
        title="Limites e consumo"
        icon={<Gauge />}
        description={clinics.length
          ? `${clinics.length} clínicas · ${counts.acima} acima do limite · ${counts.perto} perto do limite · uso mensal e cotas por clínica`
          : 'Uso mensal e cotas configuradas por clínica.'}
        actions={
          <Button type="button" variant="outline" size="icon" className="rounded-full" onClick={() => void usage.refetch()} disabled={usage.isFetching} aria-label="Atualizar dados">
            <RefreshCw className={cn('h-4 w-4', usage.isFetching && 'animate-spin')} />
          </Button>
        }
      />

      {usage.isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-28 rounded-2xl" />)}</div>
          {[1, 2, 3].map((item) => <Skeleton key={item} className="h-40 w-full rounded-2xl" />)}
        </div>
      ) : usage.isError ? (
        <Card className="rounded-2xl border-destructive/30 shadow-xs"><CardContent className="py-6" role="alert">
          <p className="font-medium">Não foi possível carregar o consumo das clínicas.</p>
          <p className="mt-1 text-sm text-muted-foreground">{mensagemDeErro(usage.error)}</p>
          <Button className="mt-3 rounded-full" variant="outline" onClick={() => void usage.refetch()}>Tentar novamente</Button>
        </CardContent></Card>
      ) : clinics.length ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Indicadores de consumo">
            {kpis.map(({ value, label, count, detail, icon: Icon, color }) => {
              const highlight = value === 'todas';
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filtro === value}
                  onClick={() => setFiltro(value)}
                  className={cn(
                    'rounded-2xl border border-border/60 bg-card p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    highlight && 'border-transparent bg-gradient-primary text-white',
                    filtro === value && !highlight && 'border-primary ring-1 ring-primary/30',
                    filtro === value && highlight && 'ring-2 ring-primary/40 ring-offset-2',
                  )}
                >
                  <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', highlight ? 'bg-white/20 text-white' : color)}><Icon className="h-5 w-5" /></span>
                  <p className="mt-3 text-2xl font-bold tabular-nums">{count}</p>
                  <p className={cn('text-sm font-medium', highlight ? 'text-white' : 'text-foreground')}>{label}</p>
                  <p className={cn('text-[11px]', highlight ? 'text-white/70' : 'text-muted-foreground')}>{detail}</p>
                </button>
              );
            })}
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar clínica" aria-label="Buscar clínica" className="h-10 rounded-full pl-9 focus-visible:ring-primary" />
            </div>
            {hasFilter && <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={clearFilters}>Limpar filtros</Button>}
            <p className="text-xs text-muted-foreground sm:ml-auto" aria-live="polite">{visibleClinics.length} de {clinics.length}</p>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Dados consolidados em {dateTimeLabel(usage.data?.generated_at)}. Notificações contam apenas envios concluídos no mês.</p>
            {visibleClinics.map((clinic) => {
              const status = usageStatus(clinic);
              return (
                <Card key={clinic.clinica_id} className={cn('rounded-2xl border-border/60 shadow-xs', status === 'acima' && 'border-destructive/40', status === 'perto' && 'border-warning/40')}>
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{clinic.clinica_nome}</CardTitle>
                      <CardDescription className="flex flex-wrap items-center gap-2">
                        Consumo do mês atual
                        {status !== 'ok' && <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', status === 'acima' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning')}>{status === 'acima' ? 'Acima do limite' : 'Perto do limite'}</span>}
                      </CardDescription>
                    </div>
                    <Button size="sm" variant="outline" className="h-9 shrink-0 gap-2 rounded-full text-xs" onClick={() => openEditor(clinic)}>
                      <Pencil className="h-4 w-4" /> Editar limites
                    </Button>
                  </CardHeader>
                  <CardContent className="grid gap-5 md:grid-cols-3">
                    <Metric label="Assentos contabilizados" used={clinic.users_used} limit={clinic.max_users} />
                    <Metric label="Tokens de IA no mês" used={clinic.ai_tokens_used} limit={clinic.max_ai_tokens} />
                    <Metric label="Notificações no mês" used={clinic.notifications_used} limit={clinic.max_notifications} />
                  </CardContent>
                </Card>
              );
            })}
            {visibleClinics.length === 0 && (
              <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="flex flex-col items-center py-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><Search className="h-6 w-6" /></span>
                <p className="mt-3 font-medium text-foreground">Nenhuma clínica com esses filtros</p>
                <p className="mt-1 text-sm text-muted-foreground">Ajuste a busca ou veja todas as clínicas.</p>
                <Button type="button" variant="outline" className="mt-4 rounded-full" onClick={clearFilters}>Limpar filtros</Button>
              </CardContent></Card>
            )}
          </div>
        </>
      ) : (
        <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="flex flex-col items-center py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md"><Gauge className="h-6 w-6" /></span>
          <p className="mt-3 font-medium text-foreground">Nenhuma clínica encontrada</p>
          <p className="mt-1 text-sm text-muted-foreground">As cotas aparecerão aqui quando clínicas forem cadastradas.</p>
        </CardContent></Card>
      )}

    </main>
  );
}
