import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const state = vi.hoisted(() => ({
  data: [] as Array<Record<string, unknown>>,
  queryResult: { isLoading: false, isError: false, isFetching: false, refetch: vi.fn() },
  invalidateQueries: vi.fn(),
  upsert: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ ...state.queryResult, data: state.data }),
  useQueryClient: () => ({ invalidateQueries: state.invalidateQueries }),
  useMutation: (options: {
    mutationFn: (items: unknown) => Promise<void>;
    onSuccess?: () => void;
    onError?: (error: unknown) => void;
  }) => ({
    isPending: false,
    mutate: (items: unknown) => {
      void options.mutationFn(items).then(() => options.onSuccess?.()).catch((error) => options.onError?.(error));
    },
  }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'user-1' }, profile: { clinica_id: 'clinic-1' } }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ upsert: state.upsert }) },
}));
vi.mock('sonner', () => ({ toast: { error: state.toastError } }));

import CentralNotificacoes from '../CentralNotificacoes';

const item = (overrides: Record<string, unknown> = {}) => ({
  source_type: 'tarefa',
  source_id: '00000000-0000-4000-8000-000000000101',
  category: 'tarefas',
  severity: 'info',
  title: 'Tarefa pendente',
  message: 'Revisar a agenda',
  occurred_at: '2026-10-14T12:00:00.000Z',
  href: '/tarefas',
  is_read: false,
  ...overrides,
});

describe('CentralNotificacoes — leitura em lote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.queryResult = { isLoading: false, isError: false, isFetching: false, refetch: vi.fn() };
    state.data = [
      item(),
      item({ source_type: 'pagamento', source_id: '00000000-0000-4000-8000-000000000102', category: 'pagamentos', severity: 'error', title: 'Pagamento vencido' }),
      item({ source_id: '00000000-0000-4000-8000-000000000103', title: 'Tarefa já lida', is_read: true }),
    ];
    state.upsert.mockResolvedValue({ error: null });
  });

  it('marca como lidas somente as não lidas visíveis no filtro atual', async () => {
    const user = userEvent.setup();
    render(<CentralNotificacoes />);
    await user.click(screen.getByRole('tab', { name: 'Tarefas' }));

    const markVisible = screen.getByRole('button', { name: /Marcar 1/ });
    expect(markVisible).toHaveTextContent('Marcar 1 visível como lida');
    expect(markVisible).toBeEnabled();
    fireEvent.click(markVisible);

    await waitFor(() => expect(state.upsert).toHaveBeenCalledOnce());
    expect(state.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        clinica_id: 'clinic-1',
        user_id: 'user-1',
        source_type: 'tarefa',
        source_id: '00000000-0000-4000-8000-000000000101',
        read_at: expect.any(String),
      }),
    ]);
    expect(state.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['central-notificacoes'] });
    expect(state.navigate).not.toHaveBeenCalled();
  });

  it('desabilita leitura em lote quando os itens visíveis já estão lidos', () => {
    state.data = [item({ is_read: true })];
    render(<CentralNotificacoes />);

    expect(screen.getByRole('button', { name: /Marcar 0/ })).toBeDisabled();
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it('mantém filtros rápidos explícitos e aplica o filtro crítico', () => {
    render(<CentralNotificacoes />);
    const indicators = screen.getByRole('group', { name: 'Indicadores e filtros rápidos de notificações' });
    const all = within(indicators).getByRole('button', { name: /Todas/ });
    const critical = within(indicators).getByRole('button', { name: /Críticas/ });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(critical).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(critical);
    expect(critical).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1 de 3 notificações')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pagamento vencido/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tarefa pendente/ })).not.toBeInTheDocument();
  });

  it('apresenta carregamento, erro com retry e estado vazio', () => {
    state.queryResult.isLoading = true;
    const loading = render(<CentralNotificacoes />);
    expect(screen.getByLabelText('Carregando notificações')).toBeInTheDocument();
    loading.unmount();

    state.queryResult.isLoading = false;
    state.queryResult.isError = true;
    const failure = render(<CentralNotificacoes />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível abrir a central');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(state.queryResult.refetch).toHaveBeenCalledOnce();
    failure.unmount();

    state.queryResult.isError = false;
    state.data = [];
    render(<CentralNotificacoes />);
    expect(screen.getByText('Nenhuma notificação por enquanto')).toBeInTheDocument();
  });

  it('mostra contagem agrupada e abre a origem do evento sem duplicar a leitura', async () => {
    state.data = [item(), item({ message: 'Cópia repetida' })];
    render(<CentralNotificacoes />);

    expect(screen.getByText('2 ocorrências')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tarefa pendente/ }));

    expect(state.navigate).toHaveBeenCalledWith('/tarefas');
    await waitFor(() => expect(state.upsert).toHaveBeenCalledOnce());
    expect(state.upsert.mock.calls[0][0]).toHaveLength(1);
  });
});
