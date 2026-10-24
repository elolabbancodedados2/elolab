import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlanoCheckout from '../PlanoCheckout';

const mocks = vi.hoisted(() => ({ billing: {} as Record<string, unknown> }));

vi.mock('@mercadopago/sdk-react', () => ({ CardPayment: () => null, initMercadoPago: vi.fn() }));
vi.mock('@/components/landing-v2/animated-gradient', () => ({ default: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ refreshProfile: vi.fn(), profile: null }),
}));
vi.mock('@/hooks/usePlanCheckout', () => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    OPEN_ORDER_STATUSES: ['criando', 'aguardando_pagamento', 'em_processamento'],
    useBillingStatus: () => mocks.billing,
    useCancelPlanOrder: mutation,
    useCreateCardSubscription: mutation,
    useCreatePlanOrder: mutation,
    usePlanOrder: () => ({ data: undefined, isError: false, refetch: vi.fn() }),
  };
});

const plano = {
  id: 'plan', slug: 'elolab-max', nome: 'EloLab Pro', descricao: null, valor: 379,
  frequencia: 'trimestral', trial_dias: 5, features: [], periodo_meses: 3,
};

function renderCheckout(query = '') {
  return render(
    <MemoryRouter initialEntries={[`/planos/checkout/elolab-max${query}`]}>
      <Routes><Route path="/planos/checkout/:slug" element={<PlanoCheckout />} /></Routes>
    </MemoryRouter>,
  );
}

function resumo() {
  return within(screen.getByRole('complementary', { name: plano.nome }));
}

describe('Resumo do checkout de planos', () => {
  beforeEach(() => {
    mocks.billing = {
      data: { public_key: 'TEST-key', sandbox: true, trial_elegivel: true, plano, assinatura: null, pedido_aberto: null },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    };
  });

  it('mostra periodicidade e data da primeira cobrança após o teste com os valores do servidor', () => {
    renderCheckout('?trial=1');
    const trialEnd = new Date(Date.now() + 5 * 86400000).toLocaleDateString('pt-BR');

    expect(resumo().getByText('Periodicidade')).toBeInTheDocument();
    expect(resumo().getByText(/a cada 3 meses/i)).toBeInTheDocument();
    expect(resumo().getByText('Primeira cobrança')).toBeInTheDocument();
    expect(resumo().getByText(new RegExp(`R\\$\\s*379,00 em ${trialEnd.replace(/\//g, '\\/')}`))).toBeInTheDocument();
  });

  it('sem teste, informa que a primeira cobrança é feita hoje', () => {
    mocks.billing = { ...mocks.billing, data: { ...(mocks.billing.data as object), trial_elegivel: false } };
    renderCheckout();

    expect(resumo().getByText('Primeira cobrança')).toBeInTheDocument();
    expect(resumo().getByText(/R\$\s*379,00 hoje/i)).toBeInTheDocument();
  });
});
