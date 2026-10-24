import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Planos from '../Planos';

const mocks = vi.hoisted(() => ({
  planos: [] as Array<Record<string, unknown>>,
  userPlan: {} as Record<string, unknown>,
  billing: {} as Record<string, unknown>,
  user: {} as Record<string, unknown>,
  navigate: vi.fn(),
  refetchBilling: vi.fn(),
}));

vi.mock('@/hooks/useSubscriptionPlan', () => ({
  usePlanos: () => ({ data: mocks.planos, isLoading: false, isError: false, refetch: vi.fn() }),
  useUserPlan: () => mocks.userPlan,
}));

vi.mock('@/hooks/usePlanCheckout', () => ({ useBillingStatus: () => mocks.billing }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'user-1', ...mocks.user }, isPlatformAdmin: false }),
}));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const planosBase = [
  {
    id: 'max', nome: 'EloLab Pro', slug: 'elolab-max', descricao: 'Para sua clínica', valor: 379,
    frequencia: 'mensal', features: ['agenda'], ativo: true, destaque: false, ordem: 1, trial_dias: 0,
  },
  {
    id: 'ultra', nome: 'EloLab Ultra', slug: 'elolab-ultra', descricao: 'Mais recursos', valor: 499,
    frequencia: 'mensal', features: ['agenda', 'agente_ia'], ativo: true, destaque: true, ordem: 2, trial_dias: 3,
  },
];

function renderPlanos() {
  return render(<MemoryRouter><Planos /></MemoryRouter>);
}

describe('Plano e assinatura', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.planos = planosBase;
    mocks.userPlan = {
      planSlug: null, hasActivePlan: false, isTrial: false, trialEnd: null, trialDaysLeft: 0,
      isLoading: false, isError: false, refetch: vi.fn(),
    };
    mocks.user = { user_metadata: {} };
    mocks.billing = { data: { assinatura: null }, isLoading: false, isError: false, refetch: mocks.refetchBilling };
  });

  it('não oferece cancelar antes de confirmar que a assinatura é recorrente', () => {
    mocks.userPlan = { ...mocks.userPlan, planSlug: 'elolab-max', hasActivePlan: true };
    mocks.billing = { data: undefined, isLoading: true, isError: false, refetch: mocks.refetchBilling };

    renderPlanos();

    expect(screen.queryByRole('button', { name: /cancelar assinatura/i })).not.toBeInTheDocument();
    expect(screen.getByText(/confirmando a forma de cobrança/i)).toBeInTheDocument();
  });

  it('bloqueia contratação enquanto o estado de cobrança não pode ser confirmado e oferece retry', () => {
    mocks.billing = { data: undefined, isLoading: false, isError: true, refetch: mocks.refetchBilling };

    renderPlanos();

    expect(screen.getByRole('alert')).toHaveTextContent(/não foi possível confirmar a situação da cobrança/i);
    for (const button of screen.getAllByRole('button', { name: /assinar agora/i })) expect(button).toBeDisabled();
    expect(screen.queryByRole('button', { name: /testar grátis 3 dias/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/teste grátis não está disponível/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /atualizar cobrança/i }));
    expect(mocks.refetchBilling).toHaveBeenCalledOnce();
  });

  it('permite contratar novamente um plano com assinatura encerrada', () => {
    mocks.userPlan = { ...mocks.userPlan, planSlug: 'elolab-max', hasActivePlan: false };
    mocks.billing = {
      data: { assinatura: { plano_slug: 'elolab-max', status: 'cancelada', modalidade: 'recorrente' } },
      isLoading: false, isError: false, refetch: mocks.refetchBilling,
    };

    renderPlanos();

    const card = screen.getByRole('heading', { name: 'EloLab Pro' }).closest('div.relative.flex');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByRole('button', { name: /assinar agora/i })).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByRole('button', { name: /seu plano atual/i })).not.toBeInTheDocument();
  });

  it('retoma o pagamento pendente e impede iniciar outro plano em paralelo', () => {
    mocks.billing = {
      data: {
        assinatura: null,
        pedido_aberto: { id: 'order-1', plano_slug: 'elolab-ultra', status: 'aguardando_pagamento' },
      },
      isLoading: false, isError: false, refetch: mocks.refetchBilling,
    };

    renderPlanos();

    expect(screen.getByRole('status')).toHaveTextContent(/pagamento pendente para elolab ultra/i);
    fireEvent.click(screen.getByRole('button', { name: /continuar pagamento/i }));
    expect(mocks.navigate).toHaveBeenCalledWith('/planos/checkout/elolab-ultra');

    const proCard = screen.getByRole('heading', { name: 'EloLab Pro' }).closest('div.relative.flex');
    const ultraCard = screen.getByRole('heading', { name: 'EloLab Ultra' }).closest('div.relative.flex');
    expect(within(proCard as HTMLElement).getByRole('button', { name: /assinar agora/i })).toBeDisabled();
    expect(within(ultraCard as HTMLElement).getByRole('button', { name: /assinar agora/i })).toBeEnabled();
  });

  it('não anuncia teste grátis quando o plano não oferece dias de teste', () => {
    renderPlanos();
    const card = screen.getByRole('heading', { name: 'EloLab Pro' }).closest('div.relative.flex');

    expect(within(card as HTMLElement).queryByRole('button', { name: /testar grátis/i })).not.toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText(/dias grátis com cartão/i)).not.toBeInTheDocument();
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /assinar agora/i }));
    expect(mocks.navigate).toHaveBeenCalledWith('/planos/checkout/elolab-max');
  });

  it('mostra o período trimestral do catálogo na oferta e no preço', () => {
    mocks.planos = [{ ...planosBase[0], frequencia: 'trimestral', valor: 379, trial_dias: 3 }];
    mocks.billing = { data: { assinatura: null, trial_elegivel: true }, isLoading: false, isError: false, refetch: mocks.refetchBilling };
    renderPlanos();

    expect(screen.getByText('/3 meses')).toBeInTheDocument();
    expect(screen.getByText(/3 dias grátis no cartão; depois, R\$\s*379,00 por 3 meses/i)).toBeInTheDocument();
    expect(screen.queryByText('/trimestral')).not.toBeInTheDocument();
  });

  it('usa a elegibilidade confirmada pelo servidor mesmo sem metadados de cadastro', () => {
    mocks.billing = { data: { assinatura: null, trial_elegivel: true }, isLoading: false, isError: false, refetch: mocks.refetchBilling };

    renderPlanos();

    expect(screen.getByRole('button', { name: /testar grátis 3 dias/i })).toBeInTheDocument();
    expect(screen.getByText(/há um teste grátis disponível para esta conta/i)).toBeInTheDocument();
  });

  it('não deixa metadados de cadastro forjados liberar um teste recusado pelo servidor', () => {
    mocks.user = { user_metadata: { checkout_flow: 'saas_subscription', checkout_plan_slug: 'elolab-ultra' } };
    mocks.billing = { data: { assinatura: null, trial_elegivel: false }, isLoading: false, isError: false, refetch: mocks.refetchBilling };

    renderPlanos();

    expect(screen.queryByRole('button', { name: /testar grátis/i })).not.toBeInTheDocument();
    expect(screen.getByText(/teste grátis não está disponível nesta conta/i)).toBeInTheDocument();
  });

  it('permite cancelar o teste ativo e explica o encerramento imediato do acesso', () => {
    mocks.userPlan = {
      ...mocks.userPlan,
      planSlug: 'elolab-ultra', hasActivePlan: true, isTrial: true,
      trialEnd: new Date(Date.now() + 2 * 86400000), trialDaysLeft: 2,
    };
    mocks.billing = {
      data: { assinatura: { plano_slug: 'elolab-ultra', status: 'trial', modalidade: 'recorrente' } },
      isLoading: false, isError: false, refetch: mocks.refetchBilling,
    };

    renderPlanos();

    expect(screen.queryByRole('button', { name: 'Assinar Agora' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar teste' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/configuracoes?tab=plano');
    mocks.navigate.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /cancelar teste grátis/i }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/cancelará a cobrança recorrente agora/i);
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/acesso ao plano será encerrado/i);
  });

  it('mostra a data e o efeito do cancelamento antes da confirmação', () => {
    const trialEnd = new Date(Date.now() + 2 * 86400000);
    mocks.userPlan = {
      ...mocks.userPlan,
      planSlug: 'elolab-ultra', hasActivePlan: true, isTrial: true, trialEnd, trialDaysLeft: 2,
    };
    mocks.billing = {
      data: { assinatura: { plano_slug: 'elolab-ultra', status: 'trial', modalidade: 'recorrente' } },
      isLoading: false, isError: false, refetch: mocks.refetchBilling,
    };

    renderPlanos();
    fireEvent.click(screen.getByRole('button', { name: /cancelar teste grátis/i }));
    const dialog = screen.getByRole('alertdialog');

    expect(dialog).toHaveTextContent(`Data do cancelamento: ${new Date().toLocaleDateString('pt-BR')}`);
    expect(dialog).toHaveTextContent(`em vez de ${trialEnd.toLocaleDateString('pt-BR')}`);
    expect(dialog).toHaveTextContent(/dados da clínica não são apagados/i);
  });

  it('usa informações de confiança verificáveis sem prometer criptografia ou suporte prioritário', () => {
    renderPlanos();

    expect(screen.getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute('href', '/politica-privacidade');
    expect(screen.getByText('Pagamento processado pelo Mercado Pago')).toBeInTheDocument();
    expect(screen.queryByText('Dados criptografados')).not.toBeInTheDocument();
    expect(screen.queryByText('Suporte prioritário')).not.toBeInTheDocument();
  });

  it('usa apenas cores frias da identidade EloLab nos cartões de planos', () => {
    renderPlanos();
    for (const nome of ['EloLab Pro', 'EloLab Ultra']) {
      const card = screen.getByRole('heading', { name: nome }).closest('div.relative.flex');
      expect(card?.className).not.toMatch(/amber|orange/);
    }
  });
});
