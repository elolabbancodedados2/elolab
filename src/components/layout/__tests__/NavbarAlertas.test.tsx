import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Navbar } from '../Navbar';

const central = [
  { source_type: 'tarefa', source_id: 't1', title: 'Revisar laudo', message: 'Tarefa pendente', severity: 'warning', href: '/tarefas', is_read: false },
  { source_type: 'consulta', source_id: 'c1', title: 'Consulta 23/10 às 09:00', message: 'Ana', severity: 'info', href: '/agenda', is_read: true },
];

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({
    user: { id: 'u1' },
    profile: { id: 'p1', nome: 'Dra. Lia', email: 'lia@example.test', role: 'medico', roles: ['medico'], clinica_id: 'clinic-1' },
    signOut: vi.fn(),
    isAdmin: () => false,
  }),
}));
vi.mock('@/hooks/useRealtimeNotifications', () => ({ useRealtimeNotifications: () => ({ notifications: [], unreadCount: 0 }) }));
vi.mock('@/hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: queryKey[0] === 'central-notificacoes' ? central : [] }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/components/GlobalSearch', () => ({ GlobalSearch: () => <div /> }));
vi.mock('@/components/KeyboardShortcutsDialog', () => ({ KeyboardShortcutsDialog: () => null }));
vi.mock('@/components/ContextualHelp', () => ({ ContextualHelp: () => null }));
vi.mock('../BarraHorario', () => ({ BarraHorario: () => null }));
vi.mock('@/hooks/useSubscriptionPlan', () => ({ useUserPlan: () => ({ hasFeature: () => true, isLoading: false, isError: false }) }));

describe('sino de notificações', () => {
  it('lista as pendências da central e conta só as não lidas', async () => {
    render(<MemoryRouter><TooltipProvider><Navbar mobileMenuOpen={false} /></TooltipProvider></MemoryRouter>);

    await userEvent.click(screen.getByRole('button', { name: 'Abrir notificações' }));

    expect(await screen.findByText('Revisar laudo')).toBeInTheDocument();
    expect(screen.getByText('Consulta 23/10 às 09:00')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Alertas/ })).toHaveTextContent('1');
    expect(screen.queryByText('Sem alertas')).not.toBeInTheDocument();
  });
});
