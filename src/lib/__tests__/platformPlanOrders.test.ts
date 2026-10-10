import { describe, expect, it, vi } from 'vitest';
import {
  applyGatewayOrder,
  paidAmountMatches,
  sanitizeOrderSnapshot,
  syncPlanOrderFromGateway,
} from '../../../supabase/functions/_shared/platformPlanOrders';
import {
  orderAprovada,
  orderCancelada,
  orderEstornada,
  orderPixAguardando,
  orderRecusadaResposta,
} from './fixtures/mercadoPagoOrders';

/**
 * Banco em memória que reproduz as regras de aplicar_status_pedido_plano()
 * (migration 20261010197000): só a primeira confirmação libera período e
 * notificações fora de ordem não reabrem pedido encerrado.
 */
function fakeDatabase(pedido: { id: string; user_id: string; valor: number; status: string; mp_order_id: string | null }) {
  const state = { pedido: { ...pedido }, liberacoes: 0, rpcCalls: [] as Record<string, unknown>[] };
  const supabase = {
    rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push(args);
      const atual = state.pedido.status;
      if (atual === 'estornado') return { data: { aplicado: false, motivo: 'estado_final' }, error: null };
      if (atual === 'pago') {
        if (args.p_status !== 'estornado') return { data: { aplicado: false, motivo: 'ja_pago' }, error: null };
        state.pedido.status = 'estornado';
        return { data: { aplicado: true, status: 'estornado' }, error: null };
      }
      if (args.p_status !== 'pago') {
        if (['recusado', 'cancelado', 'expirado'].includes(atual) && ['aguardando_pagamento', 'em_processamento'].includes(String(args.p_status))) {
          return { data: { aplicado: false, motivo: 'estado_final' }, error: null };
        }
        state.pedido.status = String(args.p_status);
        return { data: { aplicado: true, status: args.p_status }, error: null };
      }
      state.pedido.status = 'pago';
      state.liberacoes += 1;
      return { data: { aplicado: true, status: 'pago' }, error: null };
    }),
    from: vi.fn(() => ({
      select: () => ({
        eq: (_col: string, value: string) => ({
          maybeSingle: async () => ({ data: value === state.pedido.mp_order_id ? state.pedido : null, error: null }),
        }),
      }),
    })),
  };
  return { supabase, state };
}

const pedido = { id: 'pedido-1', user_id: 'user-1', valor: 399, status: 'aguardando_pagamento', mp_order_id: orderAprovada.id };

describe('aplicação de pedidos Pix/boleto', () => {
  it('aprovação libera o período uma única vez mesmo com webhook repetido', async () => {
    const { supabase, state } = fakeDatabase(pedido);
    const primeira = await applyGatewayOrder(supabase, state.pedido, orderAprovada);
    const repetida = await applyGatewayOrder(supabase, state.pedido, orderAprovada);

    expect(primeira).toMatchObject({ handled: true, status: 'pago', applied: true });
    expect(repetida).toMatchObject({ handled: true, status: 'pago', applied: false, detail: { motivo: 'ja_pago' } });
    expect(state.liberacoes).toBe(1);
  });

  it('pendência e recusa não liberam acesso', async () => {
    const { supabase, state } = fakeDatabase({ ...pedido, mp_order_id: orderPixAguardando.id });
    await applyGatewayOrder(supabase, state.pedido, orderPixAguardando);
    expect(state.pedido.status).toBe('aguardando_pagamento');

    const recusado = fakeDatabase({ ...pedido, mp_order_id: orderRecusadaResposta.data.id });
    await applyGatewayOrder(recusado.supabase, recusado.state.pedido, orderRecusadaResposta.data);
    expect(recusado.state.pedido.status).toBe('recusado');
    expect(recusado.state.liberacoes).toBe(0);
  });

  it('cancelamento encerra o pedido e notificação atrasada não o reabre', async () => {
    const { supabase, state } = fakeDatabase({ ...pedido, mp_order_id: orderCancelada.id });
    await applyGatewayOrder(supabase, state.pedido, orderCancelada);
    const atrasada = await applyGatewayOrder(supabase, state.pedido, orderPixAguardando);
    expect(state.pedido.status).toBe('cancelado');
    expect(atrasada).toMatchObject({ applied: false, detail: { motivo: 'estado_final' } });
  });

  it('estorno após pagamento é aplicado', async () => {
    const { supabase, state } = fakeDatabase(pedido);
    await applyGatewayOrder(supabase, state.pedido, orderAprovada);
    await applyGatewayOrder(supabase, state.pedido, orderEstornada);
    expect(state.pedido.status).toBe('estornado');
  });

  it('valor pago menor que o cobrado não libera acesso', async () => {
    const { supabase, state } = fakeDatabase({ ...pedido, valor: 799 });
    const result = await applyGatewayOrder(supabase, state.pedido, orderAprovada);
    expect(result).toMatchObject({ status: 'em_processamento' });
    expect(state.rpcCalls[0]).toMatchObject({ p_status: 'em_processamento', p_status_detail: 'valor_divergente' });
    expect(state.liberacoes).toBe(0);
    expect(paidAmountMatches(orderAprovada, 399)).toBe(true);
  });

  it('ignora order de outro pedido e order desconhecida no banco', async () => {
    const { supabase, state } = fakeDatabase({ ...pedido, mp_order_id: 'ORD-OUTRO' });
    expect(await applyGatewayOrder(supabase, state.pedido, orderAprovada)).toMatchObject({ ignored: true, reason: 'order_divergente' });

    const client = { request: vi.fn() };
    expect(await syncPlanOrderFromGateway(supabase, client, 'ORD-INEXISTENTE')).toEqual({ handled: false, reason: 'pedido_desconhecido' });
    expect(client.request).not.toHaveBeenCalled();
  });

  it('sincronização consulta a order no Mercado Pago em vez de confiar no corpo do webhook', async () => {
    const { supabase, state } = fakeDatabase(pedido);
    const client = { request: vi.fn().mockResolvedValue(orderAprovada) };
    await syncPlanOrderFromGateway(supabase, client, orderAprovada.id);
    expect(client.request).toHaveBeenCalledWith({ method: 'GET', path: `/v1/orders/${orderAprovada.id}` });
    expect(state.pedido.status).toBe('pago');
  });

  it('falha de comunicação propaga erro para o webhook responder 500 e o Mercado Pago reenviar', async () => {
    const { supabase } = fakeDatabase(pedido);
    const client = { request: vi.fn().mockRejectedValue(new Error('Falha de comunicação com o Mercado Pago')) };
    await expect(syncPlanOrderFromGateway(supabase, client, orderAprovada.id)).rejects.toThrow('Falha de comunicação');
  });

  it('snapshot salvo não guarda token de cartão', () => {
    const snapshot = JSON.stringify(sanitizeOrderSnapshot(orderAprovada));
    expect(snapshot).not.toContain('nao-deve-ser-salvo');
    expect(snapshot).toContain('accredited');
  });
});
