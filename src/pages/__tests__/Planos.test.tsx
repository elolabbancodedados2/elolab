import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Planos from '../Planos';

const mocks = vi.hoisted(() => ({
  planos: [] as Array<Record<string, unknown>>,
  userPlan: {} as Record<string, unknown>,
  billing: {} as Record<string, unknown>,
  navigate: vi.fn(),
  refetchBilling: vi.fn(),
}));

vi.mock('@/hooks/useSubscriptionPlan', () => ({
  usePlanos: () => ({ data: mocks.planos, isLoading: false, isError: false, refetch: vi.fn() }),
  useUserPlan: () => mocks.userPlan,
}));

vi.mock('@/hooks/usePlanCheckout', () => ({ useBillingStatus: () => mocks.billing }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'user-1' }, isPlatformAdmin: false }),
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
    id: 'max', nome: 'EloLab Max', slug: 'elolab-max', descricao: 'Para sua clínica', valor: 199,
    frequencia: 'mensal', features: ['agenda'], ativo: true, destaque: false, ordem: 1, trial_dias: 0,
  },
  {
    id: 'ultra', nome: 'EloLab Ultra', slug: 'elolab-ultra', descricao: 'Mais recursos', valor: 299,
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
    expect(screen.getByRole('button', { name: /testar grátis 3 dias/i })).toBeDisabled();
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

    const card = screen.getByRole('heading', { name: 'EloLab Max' }).closest('div.relative.flex');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByRole('button', { name: /assinar agora/i })).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByRole('button', { name: /seu plano atual/i })).not.toBeInTheDocument();
  });

  it('não anuncia teste grátis quando o plano não oferece dias de teste', () => {
    renderPlanos();
    const card = screen.getByRole('heading', { name: 'EloLab Max' }).closest('div.relative.flex');

    expect(within(card as HTMLElement).queryByRole('button', { name: /testar grátis/i })).not.toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText(/dias grátis com cartão/i)).not.toBeInTheDocument();
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /assinar agora/i }));
    expect(mocks.navigate).toHaveBeenCalledWith('/planos/checkout/elolab-max');
  });

  it('usa apenas cores frias da identidade EloLab nos cartões de planos', () => {
    renderPlanos();
    for (const nome of ['EloLab Max', 'EloLab Ultra']) {
      const card = screen.getByRole('heading', { name: nome }).closest('div.relative.flex');
      expect(card?.className).not.toMatch(/amber|orange/);
    }
  });
});
