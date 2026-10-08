import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CreditCard, RefreshCw, Search, Webhook } from 'lucide-react';

import { ErrorState } from '@/components/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

type Subscription = {
  clinica_id: string;
  clinica_nome: string;
  dono_email: string | null;
  assinatura_id: string | null;
  assinatura_status: string | null;
  em_trial: boolean | null;
  data_fim: string | null;
  trial_fim: string | null;
  plano_nome: string | null;
  plano_valor: number | null;
  mp_status: string | null;
  proximo_pagamento: string | null;
  mp_preapproval_id: string | null;
  vencida: boolean;
};
type WebhookLog = { id: string; event_id: string | null; event_type: string; data_id: string | null; processado: boolean | null; tentativas: number | null; erro_mensagem: string | null; created_at: string };
type PlatformInvoice = {
  id: string;
  clinic_name: string;
  owner_email: string | null;
  mp_authorized_payment_id: string;
  mp_preapproval_id: string;
  mp_payment_id: string | null;
  invoice_status: string;
  payment_status: string | null;
  payment_status_detail: string | null;
  amount: number | null;
  currency_id: string | null;
  invoice_type: string | null;
  date_created: string | null;
  debit_date: string | null;
  retry_attempt: number | null;
};
type Overview = {
  generated_at: string;
  metrics: { mrr: number; ativas: number; trials: number; vencidas: number; sem_assinatura: number; webhooks_pendentes: number; webhooks_falha_24h: number };
  subscriptions: Subscription[];
  webhooks: WebhookLog[];
};

const moeda = (value: number, currency = 'BRL') => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency });
const dataHora = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
};

export default function PlatformCobrancas() {
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('all');
  const overview = useQuery({
    queryKey: ['platform-billing-overview'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_billing_overview');
      if (error) throw error;
      return data as Overview;
    },
    refetchInterval: 60_000,
  });
  const invoices = useQuery({
    queryKey: ['platform-subscription-invoices'],
    queryFn: async (): Promise<PlatformInvoice[]> => {
      const { data, error } = await (supabase as any).rpc('platform_subscription_invoice_history', { p_limit: 50 });
      if (error) throw error;
      return (data || []) as PlatformInvoice[];
    },
    refetchInterval: 60_000,
  });

  const lista = useMemo(() => {
    const term = busca.trim().toLocaleLowerCase('pt-BR');
    return (overview.data?.subscriptions || []).filter((subscription) => {
      const matchesTerm = !term || `${subscription.clinica_nome} ${subscription.dono_email || ''} ${subscription.plano_nome || ''}`.toLocaleLowerCase('pt-BR').includes(term);
      const matchesStatus = status === 'all' ||
        (status === 'vencida' ? subscription.vencida :
          status === 'sem_assinatura' ? !subscription.assinatura_id :
            status === 'ativa' ? subscription.assinatura_status === 'ativa' && !subscription.em_trial && !subscription.vencida :
              status === 'trial' ? (Boolean(subscription.em_trial) || subscription.assinatura_status === 'trial') && !subscription.vencida :
                subscription.assinatura_status === status);
      return matchesTerm && matchesStatus;
    });
  }, [busca, status, overview.data]);

  const metrics = overview.data?.metrics;
  const updating = overview.isFetching;

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><CreditCard className="h-6 w-6 text-primary" /> Cobranças da plataforma</h1>
          <p className="mt-1 text-sm text-muted-foreground">Assinaturas, vencimentos e processamento do Mercado Pago.</p>
          {overview.data?.generated_at && <p className="mt-1 text-xs text-muted-foreground">Dados consolidados em {dataHora(overview.data.generated_at)}</p>}
        </div>
        <Button variant="outline" className="min-h-11" onClick={() => void overview.refetch()} disabled={updating}>
          <RefreshCw className={`mr-2 h-4 w-4 ${updating ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </header>

      {overview.isError ? <ErrorState error={overview.error} onRetry={() => { void overview.refetch(); }} /> : overview.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-24" />)}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['MRR estimado', moeda(metrics?.mrr || 0)],
            ['Assinaturas pagas ativas', metrics?.ativas || 0],
            ['Em período de teste', metrics?.trials || 0],
            ['Vencidas', metrics?.vencidas || 0],
            ['Sem assinatura', metrics?.sem_assinatura || 0],
          ].map(([label, value]) => <Card key={label}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}
        </div>
      )}

      {!overview.isError && (metrics?.webhooks_pendentes || metrics?.webhooks_falha_24h) ? (
        <Card className="border-destructive/40"><CardContent className="flex items-center gap-3 pt-6"><AlertTriangle className="h-6 w-6 shrink-0 text-destructive" /><div><p className="font-medium">Processamento financeiro requer atenção</p><p className="text-sm text-muted-foreground">{metrics.webhooks_pendentes} pendente(s) · {metrics.webhooks_falha_24h} falha(s) nas últimas 24h</p></div></CardContent></Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Carteira de clientes</CardTitle><CardDescription>{lista.length} de {overview.data?.subscriptions.length ?? 0} clínicas. Estado local da assinatura e vínculo com o Mercado Pago; expiradas não entram no total ativo nem no MRR.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-56 flex-1"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar clínicas por nome, responsável ou plano" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar clínica, responsável ou plano" className="pl-9" /></div>
            <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-48" aria-label="Filtrar assinatura"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="ativa">Ativas válidas</SelectItem><SelectItem value="trial">Trials válidos</SelectItem><SelectItem value="cancelada">Canceladas</SelectItem><SelectItem value="vencida">Vencidas</SelectItem><SelectItem value="sem_assinatura">Sem assinatura</SelectItem></SelectContent></Select>
          </div>
          {overview.isLoading ? <div className="space-y-2">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-20 w-full" />)}</div> : overview.isError ? null : lista.map((subscription) => (
            <div key={subscription.clinica_id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-6 md:items-center">
              <div className="md:col-span-2"><p className="font-medium">{subscription.clinica_nome}</p><p className="text-xs text-muted-foreground">{subscription.dono_email || 'Sem e-mail do responsável'}</p></div>
              <span className="text-sm">{subscription.plano_nome || 'Sem plano'}<small className="block text-muted-foreground">{moeda(subscription.plano_valor || 0)}/mês</small></span>
              <Badge variant={subscription.vencida ? 'destructive' : 'outline'}>{subscription.vencida ? 'Vencida' : subscription.assinatura_status || 'Sem assinatura'}</Badge>
              <span className="text-xs">Mercado Pago: {subscription.mp_status || 'não vinculado'}</span>
              <span className="text-xs text-muted-foreground">Próximo pagamento: {subscription.proximo_pagamento ? new Date(subscription.proximo_pagamento).toLocaleDateString('pt-BR') : '—'}</span>
            </div>
          ))}
          {!overview.isLoading && !overview.isError && !lista.length && <div className="flex flex-col items-center gap-2 py-6 text-center"><p className="text-sm text-muted-foreground">Nenhuma clínica corresponde à busca e ao status selecionado.</p>{(busca.trim() || status !== 'all') && <Button variant="ghost" size="sm" onClick={() => { setBusca(''); setStatus('all'); }}>Limpar filtros</Button>}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Faturas recorrentes recentes</CardTitle>
          <CardDescription>Histórico das faturas do Mercado Pago, com status da fatura e do pagamento separados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {invoices.isLoading ? [1, 2, 3].map((item) => <Skeleton key={item} className="h-16 w-full" />) : invoices.isError ? (
            <ErrorState error={invoices.error} onRetry={() => { void invoices.refetch(); }} />
          ) : (invoices.data || []).map((invoice) => (
            <div key={invoice.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{invoice.clinic_name}</p>
                <p className="truncate text-xs text-muted-foreground">{invoice.owner_email || 'Sem e-mail'} · Fatura {invoice.mp_authorized_payment_id}</p>
                <p className="text-xs text-muted-foreground">{invoice.date_created || invoice.debit_date ? dataHora(invoice.date_created || invoice.debit_date!) : 'Data indisponível'}{invoice.retry_attempt ? ` · tentativa ${invoice.retry_attempt}` : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Fatura: {invoice.invoice_status}</Badge>
                <Badge variant={invoice.payment_status === 'approved' ? 'outline' : invoice.payment_status ? 'destructive' : 'secondary'}>
                  Pagamento: {invoice.payment_status || 'sem pagamento vinculado'}
                </Badge>
              </div>
              <span className="text-sm font-semibold sm:text-right">
                {invoice.amount === null ? 'Valor indisponível' : moeda(invoice.amount, invoice.currency_id || 'BRL')}
                {invoice.payment_status_detail && <small className="block text-xs font-normal text-muted-foreground">{invoice.payment_status_detail}</small>}
              </span>
            </div>
          ))}
          {!invoices.isLoading && !invoices.isError && !invoices.data?.length && (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma fatura recorrente registrada ainda.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5" /> Webhooks recentes</CardTitle><CardDescription>Metadados operacionais; os payloads financeiros não são expostos. A lista mostra até 30 dos 100 eventos carregados.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {overview.isLoading ? <Skeleton className="h-32 w-full" /> : overview.isError ? null : (overview.data?.webhooks || []).slice(0, 30).map((webhook) => (
            <div key={webhook.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div><p className="text-sm font-medium">{webhook.event_type}</p><p className="text-xs text-muted-foreground">Evento {webhook.event_id || webhook.data_id || 'sem identificador'} · {dataHora(webhook.created_at)}</p>{webhook.erro_mensagem && <p className="break-words text-xs text-destructive">{webhook.erro_mensagem}</p>}</div>
              <div className="flex gap-2"><Badge variant="secondary">{webhook.tentativas || 0} tentativa(s)</Badge><Badge variant={webhook.processado ? 'outline' : 'destructive'}>{webhook.processado ? 'Processado' : 'Pendente'}</Badge></div>
            </div>
          ))}
          {!overview.isLoading && !overview.isError && !overview.data?.webhooks.length && <p className="py-4 text-center text-sm text-muted-foreground">Nenhum webhook registrado.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
