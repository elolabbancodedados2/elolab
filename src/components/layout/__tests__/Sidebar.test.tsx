import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from '../Sidebar';

const mocks = vi.hoisted(() => ({ useSupabaseAuth: vi.fn() }));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: mocks.useSupabaseAuth,
}));

vi.mock('@/hooks/useSubscriptionPlan', () => ({
  useUserPlan: () => ({ hasFeature: () => true, isLoading: false, isError: false }),
}));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

function renderSidebar(path: string, platformAdmin: boolean, clinicaId: string | null = 'internal-clinic') {
  mocks.useSupabaseAuth.mockReturnValue({
    profile: { roles: ['admin'], clinica_id: clinicaId },
    isAdmin: () => true,
    isSuperAdmin: platformAdmin,
    isPlatformAdmin: platformAdmin,
  });

  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Sidebar />
        <LocationProbe />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe('Sidebar alterna áreas para a dona da plataforma', () => {
  it('exibe somente os dois destinos no seletor da conta plataforma com clínica', () => {
    renderSidebar('/dashboard', true);

    const selector = screen.getByRole('group', { name: 'Alternar área' });
    expect(within(selector).getByRole('link', { name: 'App' })).toBeInTheDocument();
    expect(within(selector).getByRole('link', { name: 'Painel Admin' })).toBeInTheDocument();
  });

  it('alterna entre o dashboard clínico e o Painel Admin', async () => {
    const user = userEvent.setup();
    renderSidebar('/dashboard', true);

    const selector = screen.getByRole('group', { name: 'Alternar área' });
    await user.click(within(selector).getByRole('link', { name: 'Painel Admin' }));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/painel-admin');
    expect(within(selector).getByRole('link', { name: 'Painel Admin' })).toHaveAttribute('aria-current', 'page');

    await user.click(within(selector).getByRole('link', { name: 'App' }));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/dashboard');
    expect(within(selector).getByRole('link', { name: 'App' })).toHaveAttribute('aria-current', 'page');
  });

  it('não mostra o seletor ou links da plataforma para assinante admin de clínica', () => {
    renderSidebar('/dashboard', false);

    expect(screen.queryByRole('group', { name: 'Alternar área' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Painel Admin' })).not.toBeInTheDocument();
  });

  it('separa o App do Painel Admin e mantém o App bloqueado sem clínica', () => {
    renderSidebar('/dashboard', true, null);

    const selector = screen.getByRole('group', { name: 'Alternar área' });
    expect(within(selector).getByRole('button', { name: /App/ })).toBeDisabled();
    expect(within(selector).getByRole('link', { name: 'Painel Admin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clientes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pacientes' })).not.toBeInTheDocument();
  });
});
