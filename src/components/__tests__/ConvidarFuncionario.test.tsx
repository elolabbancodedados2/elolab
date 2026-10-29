import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConvidarFuncionario from '@/pages/ConvidarFuncionario';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

vi.mock('@/hooks/usePlanLimits', () => ({
  usePlanLimits: () => ({ data: undefined }),
}));

describe('ConvidarFuncionario', () => {
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
        <RouterProvider router={createMemoryRouter([{ path: "/", element: <ConvidarFuncionario /> }])} />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('region', { name: 'Prévia de acesso' })).toBeInTheDocument();
    expect(screen.getByText(/Selecione um papel/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Recepção'));

    expect(screen.getByText('Agenda')).toBeInTheDocument();
    expect(screen.queryByText('Contas a receber e a pagar')).not.toBeInTheDocument();
  });
});
