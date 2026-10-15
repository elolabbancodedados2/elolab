import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  auth: {
    user: { id: 'user-1' },
    profile: { id: 'user-1', clinica_id: 'clinica-1' } as { id: string; clinica_id: string } | null,
    isLoading: false,
    refreshProfile: vi.fn(),
  },
  plan: { hasFeature: vi.fn(() => true), isLoading: false },
}));

vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/hooks/useSubscriptionPlan', () => ({ useUserPlan: () => mocks.plan }));

import OnboardingClinica from '@/pages/OnboardingClinica';

function renderPage() {
  return render(<MemoryRouter><OnboardingClinica /></MemoryRouter>);
}

describe('OnboardingClinica', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.profile = { id: 'user-1', clinica_id: 'clinica-1' };
    mocks.plan.hasFeature.mockReturnValue(true);
    mocks.plan.isLoading = false;
  });

  it('mostra o erro e permite tentar novamente quando a consulta falha', () => {
    const refetch = vi.fn();
    mocks.useQuery.mockReturnValue({
      data: undefined,
      error: new Error('network error'),
      isError: true,
      isLoading: false,
      refetch,
    });

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o onboarding');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('explica quando a consulta não retorna progresso para a clínica', () => {
    mocks.useQuery.mockReturnValue({ data: undefined, isError: false, isLoading: false });

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Progresso do onboarding indisponível');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  });

  it('não fica carregando indefinidamente se a conta ainda não está vinculada a uma clínica', () => {
    mocks.auth.profile = null;
    mocks.useQuery.mockReturnValue({ data: undefined, isError: false, isLoading: false });

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Esta conta ainda não está vinculada a uma clínica');
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar perfil' }));
    expect(mocks.auth.refreshProfile).toHaveBeenCalledOnce();
  });

  it('anuncia o estado de carregamento para leitores de tela', () => {
    mocks.useQuery.mockReturnValue({ data: undefined, isError: false, isLoading: true });

    renderPage();

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('mostra progresso validado, contagem das etapas e links para continuar a configuração', () => {
    mocks.useQuery.mockReturnValue({
      data: {
        completed_steps: 1,
        total_steps: 4,
        progress: 25,
        completed_at: null,
        steps: [
          { key: 'team', complete: true, count: 1 },
          { key: 'schedule', complete: false, count: 1 },
          { key: 'services', complete: false, count: 0 },
          { key: 'whatsapp', complete: false, count: 0 },
          { key: 'appointment', complete: false, count: 0 },
        ],
      },
      isError: false,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('1 de 4 etapas essenciais concluídas')).toBeVisible();
    expect(screen.getByText('Opcional')).toBeVisible();
    expect(screen.getByText('1 usuário ativo com função de acesso')).toBeVisible();
    expect(screen.getByRole('heading', { name: /Equipe e acessos/ })).toBeVisible();
    expect(screen.getByText(/A conta de administrador já garante acesso à clínica/)).toBeVisible();
    expect(screen.getByRole('link', { name: /Gerenciar equipe/ })).toHaveAttribute('href', '/equipe?aba=funcionarios');
    expect(screen.queryByText(/Convide ao menos uma pessoa/)).not.toBeInTheDocument();
    expect(screen.getByText('1 profissional com horários disponíveis')).toBeVisible();
    expect(screen.getByRole('link', { name: /Cadastrar serviço/ })).toHaveAttribute('href', '/precos-servicos?tab=tipos');
    expect(screen.getByRole('link', { name: /Conectar WhatsApp/ })).toHaveAttribute('href', '/agente-ia');
    expect(screen.getByRole('link', { name: /Configurar disponibilidade/ })).toHaveAttribute('href', '/equipe?aba=medicos');
    expect(screen.getByRole('link', { name: /Configurar horário de funcionamento/ })).toHaveAttribute('href', '/configuracoes?tab=horarios');
    expect(screen.getByText(/aceite o convite com esta mesma conta/)).toBeVisible();
  });

  it('encaminha clientes Pro para os planos em vez de um recurso exclusivo do Ultra', () => {
    mocks.plan.hasFeature.mockReturnValue(false);
    mocks.useQuery.mockReturnValue({
      data: {
        completed_steps: 1,
        total_steps: 4,
        progress: 25,
        completed_at: null,
        steps: [{ key: 'whatsapp', complete: false, count: 0 }],
      },
      isError: false,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('Atendente de IA no WhatsApp')).toBeVisible();
    expect(screen.getByText(/Disponível no EloLab Ultra/)).toBeVisible();
    expect(screen.getByRole('link', { name: /Ver planos/ })).toHaveAttribute('href', '/planos');
    expect(screen.queryByRole('link', { name: /Conectar WhatsApp/ })).not.toBeInTheDocument();
  });
});
