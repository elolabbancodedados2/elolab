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
  roles: ['recepcao'] as string[],
  queueData: [] as unknown[],
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
    profile: { id: 'p1', nome: 'Dra. Lia', email: 'lia@example.test', role: mocks.roles[0], roles: mocks.roles, clinica_id: 'clinic-1' },
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
    const data = options.queryKey[0] === 'notification-queue' ? mocks.queueData : isNotification ? [] : undefined;
    return { data, isError: mocks.failQueries && isNotification };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/components/GlobalSearch', () => ({ GlobalSearch: () => <div /> }));
vi.mock('@/components/KeyboardShortcutsDialog', () => ({ KeyboardShortcutsDialog: () => null }));
vi.mock('@/components/ContextualHelp', () => ({ ContextualHelp: () => null }));
vi.mock('../BarraHorario', () => ({ BarraHorario: () => null }));
vi.mock('@/hooks/useSubscriptionPlan', () => ({ useUserPlan: () => ({ hasFeature: () => true, isLoading: false, isError: false }) }));

const renderNavbar = () => render(<MemoryRouter><TooltipProvider><Navbar mobileMenuOpen={false} /></TooltipProvider></MemoryRouter>);
const queryOf = (key: string) => mocks.queries.find(options => options.queryKey[0] === key)!;

describe('consultas de notificações da Navbar', () => {
  beforeEach(() => {
    mocks.queries.length = 0;
    mocks.queueSelect.mockClear();
    mocks.queueResult = { data: null, error: null };
    mocks.failQueries = false;
    mocks.roles = ['recepcao'];
    mocks.queueData = [];
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

  it('esconde a aba Enviados e não consulta a fila para quem não é admin nem recepção', async () => {
    mocks.roles = ['medico'];
    renderNavbar();
    expect((queryOf('notification-queue') as QueryOptions & { enabled?: boolean }).enabled).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir notificações' }));
    expect(screen.queryByRole('tab', { name: /Enviados/ })).not.toBeInTheDocument();
  });

  it('o menu Novo leva às telas de criação permitidas para o papel', async () => {
    mocks.roles = ['medico'];
    const { unmount } = renderNavbar();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar rapidamente' }));
    const destinos = screen.getAllByRole('menuitem').map(item => item.getAttribute('href'));
    expect(destinos).toEqual(['/agenda/nova', '/pacientes/novo', '/documentos-clinicos/nova-prescricao', '/exames/nova']);
    unmount();

    mocks.roles = ['recepcao'];
    const recepcao = renderNavbar();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar rapidamente' }));
    expect(screen.getAllByRole('menuitem').map(item => item.getAttribute('href'))).toEqual(['/agenda/nova', '/pacientes/novo']);
    recepcao.unmount();

    mocks.roles = ['financeiro'];
    renderNavbar();
    expect(screen.queryByRole('button', { name: 'Adicionar rapidamente' })).not.toBeInTheDocument();
  });

  it('o sino só acende por envio com problema, não por envio concluído', async () => {
    mocks.queueData = [
      { id: 'a', tipo: 'email', status: 'enviado', assunto: 'Lembrete', created_at: '2026-10-31T10:00:00Z' },
      { id: 'b', tipo: 'email', status: 'pendente', assunto: 'Lembrete', created_at: '2026-10-31T10:00:00Z' },
    ];
    const { unmount } = renderNavbar();
    expect(screen.queryByText(/notificações$/)).not.toBeInTheDocument();
    expect(document.querySelector('.animate-ping')).toBeNull();
    unmount();

    mocks.queueData = [...mocks.queueData, { id: 'c', tipo: 'email', status: 'erro', assunto: 'Lembrete', created_at: '2026-10-31T10:00:00Z' }];
    renderNavbar();
    expect(document.querySelector('.animate-ping')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir notificações' }));
    await userEvent.click(screen.getByRole('tab', { name: /Enviados/ }));
    expect(await screen.findByText('Erro no envio')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').some(item => item.getAttribute('href') === '/notificacoes')).toBe(true);
  });
});
