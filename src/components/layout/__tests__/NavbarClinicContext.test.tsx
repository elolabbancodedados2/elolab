import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Navbar } from '../Navbar';

const mocks = vi.hoisted(() => ({
  profile: null as null | { id: string; nome: string; email: string; role: string; roles: string[]; clinica_id: string },
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: null, profile: mocks.profile, signOut: vi.fn(), isAdmin: () => mocks.profile?.role === 'admin' }),
}));
vi.mock('@/hooks/useRealtimeNotifications', () => ({ useRealtimeNotifications: () => ({ notifications: [], unreadCount: 0 }) }));
vi.mock('@/hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: queryKey[0] === 'navbar-clinic-context' ? { nome: 'EloLab Centro' } : [] }),
}));
vi.mock('@/components/GlobalSearch', () => ({ GlobalSearch: () => <div /> }));
vi.mock('@/components/KeyboardShortcutsDialog', () => ({ KeyboardShortcutsDialog: () => null }));
vi.mock('@/components/ContextualHelp', () => ({ ContextualHelp: () => null }));
vi.mock('../BarraHorario', () => ({ BarraHorario: () => null }));

describe('contexto ativo no cabeçalho', () => {
  it('mostra o nome da clínica e o papel principal autenticado', () => {
    mocks.profile = {
      id: 'staff-1', nome: 'Marina Souza', email: 'marina@example.test',
      role: 'recepcao', roles: ['recepcao'], clinica_id: 'clinic-1',
    };

    render(<MemoryRouter><TooltipProvider><Navbar mobileMenuOpen={false} /></TooltipProvider></MemoryRouter>);

    const context = screen.getByRole('group', { name: 'Contexto ativo' });
    expect(context).toHaveTextContent('EloLab Centro');
    expect(context).toHaveTextContent('Recepção');
  });

  it('não apresenta clínica ou papel quando a sessão ainda não tem perfil clínico', () => {
    mocks.profile = null;

    render(<MemoryRouter><TooltipProvider><Navbar mobileMenuOpen={false} /></TooltipProvider></MemoryRouter>);

    expect(screen.queryByRole('group', { name: 'Contexto ativo' })).not.toBeInTheDocument();
  });
});
