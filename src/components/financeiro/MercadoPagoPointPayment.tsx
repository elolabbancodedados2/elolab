import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2, Radio, RefreshCw, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/formatters';

type Terminal = { id: string; pos_id: string | null; external_pos_id: string | null; operating_mode: string };
type PointOrder = {
  id: string;
  lancamento_id: string;
  mp_order_id: string | null;
  terminal_id: string;
  valor: number;
  status: string;
  status_detail: string | null;
  payment_sync_status: string;
  payment_sync_error: string | null;
  expires_at: string | null;
  paid_at: string | null;
};

async function invokePoint<T>(action: string, input: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('mercadopago-point', { body: { action, ...input } });
  if (error) {
    const response = (error as { context?: Response }).context;
    const payload = response?.json ? await response.json().catch(() => null) : null;
    throw new Error(payload?.error || 'Não foi possível falar com o Mercado Pago.');
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

const statusLabels: Record<string, string> = {
  creating: 'Preparando cobrança',
  created: 'Aguardando o terminal',
  at_terminal: 'Cobrança no terminal',
  action_required: 'Ação necessária no terminal',
  processed: 'Pagamento aprovado',
  failed: 'Pagamento recusado',
  canceled: 'Cobrança cancelada',
  expired: 'Cobrança expirada',
  refunded: 'Pagamento estornado',
};

export function MercadoPagoPointPayment({
  clinicId,
  lancamentoId,
  open,
  disabled,
  saldo,
  onPendingChange,
}: {
  clinicId: string | null | undefined;
  lancamentoId: string | undefined;
  open: boolean;
  disabled?: boolean;
  saldo: number;
  onPendingChange: (pending: boolean) => void;
}) {
  const client = useQueryClient();
  const [terminalId, setTerminalId] = useState('');
  const baseQueryKey = ['mp-point-checkout', clinicId, lancamentoId];
  const terminalsQuery = useQuery({
    queryKey: [...baseQueryKey, 'terminals'],
    enabled: open && !!clinicId && !!lancamentoId,
    queryFn: async () => invokePoint<{ connected: boolean; terminals: Terminal[] }>('list_terminals'),
    staleTime: 30_000,
  });
  const ordersQuery = useQuery({
    queryKey: [...baseQueryKey, 'orders'],
    enabled: open && !!clinicId && !!lancamentoId,
    queryFn: async () => invokePoint<{ connected: boolean; orders: PointOrder[] }>('list_orders'),
    staleTime: 0,
    refetchInterval: (query) => {
      const orders = query.state.data?.orders ?? [];
      return open && orders.some(order => order.lancamento_id === lancamentoId && ['created', 'at_terminal', 'action_required', 'creating'].includes(order.status)) ? 5_000 : false;
    },
  });
  const order = useMemo(
    () => (ordersQuery.data?.orders ?? []).find(item => item.lancamento_id === lancamentoId
      && ['creating', 'created', 'at_terminal', 'action_required', 'processed', 'refunded'].includes(item.status)) ?? null,
    [ordersQuery.data?.orders, lancamentoId],
  );
  const refresh = () => client.invalidateQueries({ queryKey: baseQueryKey });

  const createMutation = useMutation({
    mutationFn: () => invokePoint<{ order: { id: string; mp_order_id: string; status: string; valor: number } }>('create_order', {
      lancamento_id: lancamentoId,
      terminal_id: terminalId,
      request_id: crypto.randomUUID(),
    }),
    onSuccess: refresh,
    onError: refresh,
  });
  const syncMutation = useMutation({
    mutationFn: (mpOrderId: string) => invokePoint<{ order: PointOrder }>('sync_order', { mp_order_id: mpOrderId }),
    onSuccess: () => {
      refresh();
      void client.invalidateQueries({ queryKey: ['lancamentos'] });
      void client.invalidateQueries({ queryKey: ['pagamentos-contas-receber'] });
      void client.invalidateQueries({ queryKey: ['pagamentos-do-dia'] });
      void client.invalidateQueries({ queryKey: ['caixa-diario'] });
    },
  });
  const cancelMutation = useMutation({
    mutationFn: (id: string) => invokePoint('cancel_order', { order_id: id }),
    onSuccess: refresh,
  });

  const connected = terminalsQuery.data?.connected === true && ordersQuery.data?.connected === true;
  const busy = createMutation.isPending || syncMutation.isPending || cancelMutation.isPending;
  const openOrder = !!order && ['creating', 'created', 'at_terminal', 'action_required'].includes(order.status);
  const cancellationPending = order?.status === 'at_terminal' && order.status_detail === 'cancel_requested';
  const canCancelOrder = !!order && ['created', 'at_terminal'].includes(order.status) && !cancellationPending;
  const paymentRecorded = order?.payment_sync_status === 'registrado';
  const blocksManual = openOrder || (!!order && order.status === 'processed' && !paymentRecorded);

  useEffect(() => {
    onPendingChange(blocksManual);
  }, [blocksManual, onPendingChange]);

  if (!open || !lancamentoId) return null;

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 space-y-3" aria-label="Mercado Pago Point">
      <div className="flex items-start gap-3">
        <Radio className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Cobrar no Mercado Pago Point</p>
          <p className="text-xs text-muted-foreground">Opcional. O recebimento aprovado será incluído automaticamente no resumo financeiro.</p>
        </div>
      </div>

      {terminalsQuery.isLoading || ordersQuery.isLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando a conta e os terminais…</p>
      ) : !connected ? (
        <div className="rounded-lg bg-muted/70 p-3 text-xs">
          <p className="text-muted-foreground">A clínica pode receber normalmente pelos meios já disponíveis. Para cobrar no Point, conecte a própria conta Mercado Pago.</p>
          <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0">
            <Link to="/configuracoes?tab=integracoes">Conectar conta Mercado Pago</Link>
          </Button>
        </div>
      ) : (terminalsQuery.data?.terminals?.length ?? 0) === 0 ? (
        <div className="rounded-lg bg-muted/70 p-3 text-xs text-muted-foreground">
          Nenhum terminal foi encontrado nesta conta Mercado Pago. Verifique os terminais na conta conectada.
        </div>
      ) : order ? (
        <div className="rounded-lg border bg-background p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              {paymentRecorded ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertCircle className="h-4 w-4 text-primary" />}
              {statusLabels[order.status] ?? 'Status do pagamento'}
            </span>
            <span className="text-sm font-semibold tabular-nums">{formatCurrency(Number(order.valor))}</span>
          </div>
          {order.payment_sync_status === 'pendente_caixa' && (
            <p className="text-xs text-warning-foreground">Pagamento aprovado no terminal. Abra o caixa de hoje e atualize o status para registrá-lo no financeiro.</p>
          )}
          {order.payment_sync_status === 'falha' && (
            <p role="alert" className="text-xs text-destructive">{order.payment_sync_error || 'A conciliação exige conferência.'}</p>
          )}
          {cancellationPending && (
            <p role="status" className="text-xs text-muted-foreground">Cancelamento solicitado ao terminal; aguardando confirmação do Mercado Pago.</p>
          )}
          {order.status_detail && !cancellationPending && <p className="text-[11px] text-muted-foreground">{order.status_detail}</p>}
          <div className="flex flex-wrap gap-2">
            {order.mp_order_id && !paymentRecorded && (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => syncMutation.mutate(order.mp_order_id!)}>
                {syncMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                Atualizar status
              </Button>
            )}
            {canCancelOrder && (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => cancelMutation.mutate(order.id)}>
                {cancelMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1 h-3.5 w-3.5" />}
                Cancelar no terminal
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={terminalId} onValueChange={setTerminalId} disabled={disabled || busy}>
            <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Selecione o terminal" /></SelectTrigger>
            <SelectContent>
              {terminalsQuery.data?.terminals?.map(terminal => (
                <SelectItem key={terminal.id} value={terminal.id}>
                  {terminal.external_pos_id || terminal.pos_id || terminal.id} · {terminal.operating_mode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" disabled={disabled || busy || !terminalId || saldo <= 0} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Radio className="mr-1 h-4 w-4" />}
            Enviar {formatCurrency(saldo)} ao terminal
          </Button>
        </div>
      )}

      {(createMutation.error || syncMutation.error || cancelMutation.error || terminalsQuery.error || ordersQuery.error) && connected && (
        <p role="alert" className="text-xs text-destructive">
          {(createMutation.error || syncMutation.error || cancelMutation.error || terminalsQuery.error || ordersQuery.error)?.message}
        </p>
      )}
    </section>
  );
}
