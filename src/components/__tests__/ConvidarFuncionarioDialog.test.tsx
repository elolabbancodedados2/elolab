import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConvidarFuncionarioDialog } from '../ConvidarFuncionarioDialog';

vi.mock('@/hooks/usePlanLimits', () => ({
  usePlanLimits: () => ({ data: undefined }),
}));

describe('ConvidarFuncionarioDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  it('shows and updates access preview even while plan limits are unavailable', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ConvidarFuncionarioDialog trigger={<button>Convidar equipe</button>} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Convidar equipe' }));
    expect(screen.getByRole('region', { name: 'Prévia de acesso' })).toBeInTheDocument();
    expect(screen.getByText(/Selecione um papel/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Recepção'));

    expect(screen.getByText('Agenda')).toBeInTheDocument();
    expect(screen.queryByText('Contas a receber e a pagar')).not.toBeInTheDocument();
  });
});
