import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Navbar } from '../Navbar';

// O seletor entre App e Painel Admin saiu do menu lateral e fica no cabeçalho global.
const mocks = vi.hoisted(() => ({ useSupabaseAuth: vi.fn() }));

vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: mocks.useSupabaseAuth }));
vi.mock('@/hooks/useRealtimeNotifications', () => ({ useRealtimeNotifications: () => ({ notifications: [], unreadCount: 0 }) }));
vi.mock('@/hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }), useQueryClient: () => ({ invalidateQueries: vi.fn() }), useMutation: () => ({ mutate: vi.fn() }) }));
vi.mock('@/components/GlobalSearch', () => ({ GlobalSearch: () => <div /> }));
vi.mock('@/components/KeyboardShortcutsDialog', () => ({ KeyboardShortcutsDialog: () => null }));
vi.mock('@/components/ContextualHelp', () => ({ ContextualHelp: () => null }));
vi.mock('../BarraHorario', () => ({ BarraHorario: () => null }));
vi.mock('@/hooks/useSubscriptionPlan', () => ({ useUserPlan: () => ({ hasFeature: () => true, isLoading: false, isError: false }) }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

function renderNavbar(path: string, platformAdmin: boolean, clinicaId: string | null = 'internal-clinic') {
  mocks.useSupabaseAuth.mockReturnValue({
    profile: { nome: 'Dona', roles: ['admin'], role: 'admin', clinica_id: clinicaId },
    signOut: vi.fn(),
    isAdmin: () => true,
    isSuperAdmin: platformAdmin,
    isPlatformAdmin: platformAdmin,
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Navbar mobileMenuOpen={false} />
        <LocationProbe />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe('cabeçalho alterna áreas para a dona da plataforma', () => {
  it('exibe somente os dois destinos no seletor da conta plataforma com clínica', () => {
    renderNavbar('/dashboard', true);

    const selector = screen.getByRole('navigation', { name: 'Alternar área' });
    expect(within(selector).getAllByRole('link')).toHaveLength(2);
    expect(within(selector).getByRole('link', { name: 'App' })).toBeInTheDocument();
    expect(within(selector).getByRole('link', { name: 'Painel Admin' })).toBeInTheDocument();
  });

  it('alterna entre o dashboard clínico e o Painel Admin', async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', true);

    const selector = screen.getByRole('navigation', { name: 'Alternar área' });
    await user.click(within(selector).getByRole('link', { name: 'Painel Admin' }));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/painel-admin');
    expect(within(selector).getByRole('link', { name: 'Painel Admin' })).toHaveAttribute('aria-current', 'page');

    await user.click(within(selector).getByRole('link', { name: 'App' }));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/dashboard');
    expect(within(selector).getByRole('link', { name: 'App' })).toHaveAttribute('aria-current', 'page');
  });

  it('não mostra o seletor para assinante admin de clínica', () => {
    renderNavbar('/dashboard', false);

    expect(screen.queryByRole('navigation', { name: 'Alternar área' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Painel Admin' })).not.toBeInTheDocument();
  });

  it('mantém o App bloqueado quando a conta plataforma não tem clínica', () => {
    renderNavbar('/painel-admin', true, null);

    const selector = screen.getByRole('navigation', { name: 'Alternar área' });
    expect(within(selector).getByRole('button', { name: /App/ })).toBeDisabled();
    expect(within(selector).getByRole('link', { name: 'Painel Admin' })).toBeInTheDocument();
  });
});
