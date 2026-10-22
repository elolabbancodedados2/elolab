import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Building2, CheckCircle2, Gauge, Loader2, Pencil, RefreshCw, Save, Search, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';
import { cn } from '@/lib/utils';

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

function percentage(used: number, limit: number) {
  if (limit === 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function numberLabel(value: number) {
  return Number(value || 0).toLocaleString('pt-BR');
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
  const [form, setForm] = useState<LimitForm | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<UsageStatus | 'todas'>('todas');
  const saveLock = useRef(false);

  const usage = useQuery({
    queryKey: ['platform-usage'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_usage_overview');
      if (error) throw error;
      return data as UsageOverview;
    },
    refetchInterval: 60_000,
  });

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
      setForm(null);
      toast.success('Limites atualizados.');
      void queryClient.invalidateQueries({ queryKey: ['platform-usage'] });
    },
    onError: (error) => toast.error('Não foi possível salvar os limites.', { description: mensagemDeErro(error) }),
    onSettled: () => { saveLock.current = false; },
  });

  const parsed = form ? {
    max_users: Number(form.max_users),
    max_ai_tokens: Number(form.max_ai_tokens),
    max_notifications: Number(form.max_notifications),
  } : null;
  const formValid = !!parsed && !!form?.max_users.trim() && !!form.max_ai_tokens.trim() && !!form.max_notifications.trim() &&
    Number.isSafeInteger(parsed.max_users) && parsed.max_users >= 1 &&
    Number.isSafeInteger(parsed.max_ai_tokens) && parsed.max_ai_tokens >= 0 &&
    Number.isSafeInteger(parsed.max_notifications) && parsed.max_notifications >= 0 &&
    Object.values(parsed).every((value) => value <= 2_147_483_647);
  const limitsBelowUsage = form && parsed ? [
    parsed.max_users < form.clinic.users_used ? 'assentos de usuários' : null,
    parsed.max_ai_tokens < form.clinic.ai_tokens_used ? 'tokens de IA do mês' : null,
    parsed.max_notifications < form.clinic.notifications_used ? 'notificações do mês' : null,
  ].filter((item): item is string => item !== null) : [];

  const openEditor = (clinic: Clinic) => setForm({
    clinic,
    max_users: String(clinic.max_users),
    max_ai_tokens: String(clinic.max_ai_tokens),
    max_notifications: String(clinic.max_notifications),
  });

  const editField = (field: keyof Limits, value: string) => setForm((current) => current ? { ...current, [field]: value } : current);
  const save = () => {
    if (!form || !parsed || !formValid || saveLock.current) return;
    saveLock.current = true;
    saveLimits.mutate({ clinica_id: form.clinic.clinica_id, ...parsed });
  };
  const clinics = usage.data?.clinics ?? [];
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
                    filtro === value && !highlight && 'border-[#1080CA] ring-1 ring-[#1080CA]/30',
                    filtro === value && highlight && 'ring-2 ring-[#1080CA]/40 ring-offset-2',
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
              <Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar clínica" aria-label="Buscar clínica" className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]" />
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

      <Dialog open={!!form} onOpenChange={(open) => !open && !saveLimits.isPending && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar limites</DialogTitle>
            <DialogDescription>{form?.clinic.clinica_nome}. Valores inteiros; o limite de usuários deve ser pelo menos 1. Os outros limites podem ser zerados.</DialogDescription>
          </DialogHeader>
          {form && <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="limit-users">Assentos de usuários</Label>
              <Input id="limit-users" type="number" inputMode="numeric" min={1} max={2_147_483_647} step={1} value={form.max_users} onChange={(event) => editField('max_users', event.target.value)} disabled={saveLimits.isPending} />
              <p className="text-xs text-muted-foreground">Contas contabilizadas: {numberLabel(form.clinic.users_used)}. Bloquear o login não libera um assento automaticamente.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit-ai">Tokens de IA por mês</Label>
              <Input id="limit-ai" type="number" inputMode="numeric" min={0} max={2_147_483_647} step={1} value={form.max_ai_tokens} onChange={(event) => editField('max_ai_tokens', event.target.value)} disabled={saveLimits.isPending} />
              <p className="text-xs text-muted-foreground">Atualmente em uso: {numberLabel(form.clinic.ai_tokens_used)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit-notifications">Notificações por mês</Label>
              <Input id="limit-notifications" type="number" inputMode="numeric" min={0} max={2_147_483_647} step={1} value={form.max_notifications} onChange={(event) => editField('max_notifications', event.target.value)} disabled={saveLimits.isPending} />
              <p className="text-xs text-muted-foreground">Atualmente em uso: {numberLabel(form.clinic.notifications_used)}</p>
            </div>
            {limitsBelowUsage.length > 0 && <div role="status" className="space-y-1 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
              <p>Estes limites ficam abaixo do consumo atual: {limitsBelowUsage.join(', ')}.</p>
              {limitsBelowUsage.includes('assentos de usuários') && <p>A cota de assentos não é mensal. Bloquear o login não reduz a contagem; peça ao suporte para revisar as contas contabilizadas ou o limite.</p>}
              {(limitsBelowUsage.includes('tokens de IA do mês') || limitsBelowUsage.includes('notificações do mês')) && <p>As cotas de IA e notificações podem bloquear novos usos até o próximo mês ou até que o limite seja ampliado.</p>}
            </div>}
          </div>}
          <DialogFooter>
            <Button variant="outline" className="min-h-11 rounded-full" onClick={() => setForm(null)} disabled={saveLimits.isPending}>Cancelar</Button>
            <Button className="min-h-11 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110" onClick={save} disabled={!formValid || saveLimits.isPending}>
              {saveLimits.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar limites
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
