import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gauge, Loader2, Pencil, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';

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

function dateTimeLabel(value?: string) {
  if (!value) return 'indisponível';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'indisponível' : date.toLocaleString('pt-BR');
}

export default function PlatformConsumo() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LimitForm | null>(null);
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

  const Metric = ({ label, used, limit }: { label: string; used: number; limit: number }) => {
    const percent = percentage(used, limit);
    const reached = used >= limit && limit > 0;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-1 text-sm">
          <span>{label}</span>
          <span className="tabular-nums text-muted-foreground">{numberLabel(used)} / {numberLabel(limit)}</span>
        </div>
        <Progress value={percent} aria-label={`${label}: ${numberLabel(used)} usados de ${numberLabel(limit)}`} />
        {used > limit && <p className="text-xs font-medium text-destructive">Acima do limite por {numberLabel(used - limit)}.</p>}
        {limit === 0 && <p className="text-xs text-muted-foreground">Cota zerada para este ciclo.</p>}
        {reached && used === limit && <p className="text-xs text-warning">Limite atingido.</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Gauge className="h-6 w-6 text-primary" /> Limites e consumo</h1>
          <p className="mt-1 text-sm text-muted-foreground">Uso mensal e cotas configuradas por clínica.</p>
        </div>
        <Button variant="outline" className="min-h-11" onClick={() => void usage.refetch()} disabled={usage.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${usage.isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </header>

      {usage.isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-40 w-full" />)}</div>
      ) : usage.isError ? (
        <Card><CardContent className="py-6" role="alert">
          <p className="font-medium">Não foi possível carregar o consumo das clínicas.</p>
          <p className="mt-1 text-sm text-muted-foreground">{mensagemDeErro(usage.error)}</p>
          <Button className="mt-3" variant="outline" onClick={() => void usage.refetch()}>Tentar novamente</Button>
        </CardContent></Card>
      ) : clinics.length ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Dados consolidados em {dateTimeLabel(usage.data?.generated_at)}. Notificações contam apenas envios concluídos no mês.</p>
          {clinics.map((clinic) => (
            <Card key={clinic.clinica_id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">{clinic.clinica_nome}</CardTitle>
                  <CardDescription>Consumo do mês atual</CardDescription>
                </div>
                <Button size="sm" variant="outline" className="min-h-11 shrink-0" onClick={() => openEditor(clinic)}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar limites
                </Button>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-3">
                <Metric label="Assentos contabilizados" used={clinic.users_used} limit={clinic.max_users} />
                <Metric label="Tokens de IA no mês" used={clinic.ai_tokens_used} limit={clinic.max_ai_tokens} />
                <Metric label="Notificações no mês" used={clinic.notifications_used} limit={clinic.max_notifications} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card><CardContent className="py-12 text-center">
          <Gauge className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 font-medium">Nenhuma clínica encontrada</p>
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
            {limitsBelowUsage.length > 0 && <div role="status" className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <p>Estes limites ficam abaixo do consumo atual: {limitsBelowUsage.join(', ')}.</p>
              {limitsBelowUsage.includes('assentos de usuários') && <p>A cota de assentos não é mensal. Bloquear o login não reduz a contagem; peça ao suporte para revisar as contas contabilizadas ou o limite.</p>}
              {(limitsBelowUsage.includes('tokens de IA do mês') || limitsBelowUsage.includes('notificações do mês')) && <p>As cotas de IA e notificações podem bloquear novos usos até o próximo mês ou até que o limite seja ampliado.</p>}
            </div>}
          </div>}
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setForm(null)} disabled={saveLimits.isPending}>Cancelar</Button>
            <Button className="min-h-11" onClick={save} disabled={!formValid || saveLimits.isPending}>
              {saveLimits.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar limites
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
