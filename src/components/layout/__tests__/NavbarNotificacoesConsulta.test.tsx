import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Navbar } from '../Navbar';

type QueryOptions = { queryKey: unknown[]; queryFn: () => Promise<unknown>; refetchInterval?: number };

const mocks = vi.hoisted(() => ({
  queries: [] as QueryOptions[],
  queueResult: { data: null as unknown, error: null as unknown },
  queueSelect: vi.fn(),
  failQueries: false,
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = {
    select: (columns: string) => { mocks.queueSelect(columns); return builder; },
    eq: () => builder,
    order: () => builder,
    limit: () => Promise.resolve(mocks.queueResult),
  };
  return { supabase: { from: () => builder, rpc: vi.fn() } };
});
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
  useQuery: (options: QueryOptions) => {
    mocks.queries.push(options);
    const isNotification = options.queryKey[0] === 'notification-queue' || options.queryKey[0] === 'central-notificacoes';
    return { data: isNotification ? [] : undefined, isError: mocks.failQueries && isNotification };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/components/GlobalSearch', () => ({ GlobalSearch: () => <div /> }));
vi.mock('@/components/KeyboardShortcutsDialog', () => ({ KeyboardShortcutsDialog: () => null }));
vi.mock('@/components/ContextualHelp', () => ({ ContextualHelp: () => null }));
vi.mock('../BarraHorario', () => ({ BarraHorario: () => null }));

const renderNavbar = () => render(<MemoryRouter><TooltipProvider><Navbar mobileMenuOpen={false} /></TooltipProvider></MemoryRouter>);
const queryOf = (key: string) => mocks.queries.find(options => options.queryKey[0] === key)!;

describe('consultas de notificações da Navbar', () => {
  beforeEach(() => {
    mocks.queries.length = 0;
    mocks.queueSelect.mockClear();
    mocks.queueResult = { data: null, error: null };
    mocks.failQueries = false;
  });

  it('atualiza a cada 60 s, apoiada no realtime, em vez de polling curto', () => {
    renderNavbar();
    expect(queryOf('notification-queue').refetchInterval).toBe(60_000);
    expect(queryOf('central-notificacoes').refetchInterval).toBe(60_000);
  });

  it('busca só as colunas exibidas e propaga o erro da leitura', async () => {
    renderNavbar();
    mocks.queueResult = { data: null, error: new Error('falha sintética') };
    await expect(queryOf('notification-queue').queryFn()).rejects.toThrow('falha sintética');
    const columns = mocks.queueSelect.mock.calls[0][0] as string;
    expect(columns).not.toContain('*');
    expect(columns).not.toMatch(/conteudo|erro_mensagem/);

    mocks.queueResult = { data: [{ id: 'n1' }], error: null };
    await expect(queryOf('notification-queue').queryFn()).resolves.toEqual([{ id: 'n1' }]);
  });

  it('informa a falha em vez de mostrar listas vazias', async () => {
    mocks.failQueries = true;
    renderNavbar();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir notificações' }));
    expect(await screen.findByText('Não foi possível atualizar os alertas da clínica.')).toBeInTheDocument();
    expect(screen.queryByText('Sem alertas')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Enviados/ }));
    expect(await screen.findByText('Não foi possível carregar os envios recentes.')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum envio recente')).not.toBeInTheDocument();
  });
});
