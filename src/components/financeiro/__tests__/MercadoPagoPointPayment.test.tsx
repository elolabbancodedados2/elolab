import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import { MercadoPagoPointPayment } from '../MercadoPagoPointPayment';

function renderizar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MercadoPagoPointPayment clinicId="c1" lancamentoId="l1" open saldo={100} onPendingChange={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MercadoPagoPointPayment', () => {
  it('falha de rede mostra erro com nova tentativa, não pede para conectar a conta', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Failed to fetch') });
    renderizar();
    expect(await screen.findByText(/Não foi possível consultar o Mercado Pago/)).toBeInTheDocument();
    expect(screen.queryByText('Conectar conta Mercado Pago')).not.toBeInTheDocument();
  });

  it('só pede conexão quando o servidor responde que a conta não está conectada', async () => {
    invoke.mockResolvedValue({ data: { connected: false, terminals: [], orders: [] }, error: null });
    renderizar();
    expect(await screen.findByText('Conectar conta Mercado Pago')).toBeInTheDocument();
  });

  it('traduz o detalhe do status', async () => {
    invoke.mockImplementation(async (_nome: string, { body }: { body: { action: string } }) => ({
      data: body.action === 'list_terminals'
        ? { connected: true, terminals: [{ id: 't1', pos_id: 'POS 1', external_pos_id: null, operating_mode: 'PDV' }] }
        : { connected: true, orders: [{ id: 'o1', lancamento_id: 'l1', mp_order_id: 'm1', terminal_id: 't1', valor: 100, status: 'at_terminal', status_detail: 'cc_rejected_high_risk', payment_sync_status: 'pendente', payment_sync_error: null, expires_at: null, paid_at: null }] },
      error: null,
    }));
    renderizar();
    expect(await screen.findByText('Recusado por segurança')).toBeInTheDocument();
  });
});
