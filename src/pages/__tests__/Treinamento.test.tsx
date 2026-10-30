import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Treinamento from '../Treinamento';

const mocks = vi.hoisted(() => ({
  roles: ['admin'] as string[],
  progressError: null as Error | null,
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({
    user: { id: 'user-1' },
    profile: { clinica_id: 'clinic-1', roles: mocks.roles },
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        upsert: async () => ({ error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ data: mocks.progressError ? null : [], error: mocks.progressError }).then(resolve, reject),
      };
      return query;
    },
  },
}));

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}{location.search}</output>;
}

function renderTreinamento(path = '/treinamento') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}><QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/treinamento" element={<Treinamento />} />
        <Route path="/treinamento/:tutorialKey" element={<Treinamento />} />
      </Routes>
      <CurrentPath />
    </QueryClientProvider></MemoryRouter>,
  );
}

describe('Treinamento', () => {
  beforeEach(() => {
    mocks.roles = ['admin'];
    mocks.progressError = null;
  });

  it('mantém os roteiros disponíveis quando o histórico de progresso falha', async () => {
    mocks.progressError = new Error('offline');
    renderTreinamento();

    expect(await screen.findByText(/os roteiros continuam disponíveis/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fluxo clínico responsável' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /começar tutorial/i }).length).toBeGreaterThan(0);
  });

  it('oculta a etapa de documentos para enfermagem, cuja rota não permite acesso', async () => {
    mocks.roles = ['enfermagem'];
    renderTreinamento();

    const tutorial = await screen.findByRole('heading', { name: 'Fluxo clínico responsável' });
    fireEvent.click(screen.getAllByRole('button', { name: /começar tutorial/i })[1]);
    expect(screen.getByTestId('current-path')).toHaveTextContent('/treinamento/fluxo-clinico');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Confirme a pessoa atendida' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/treinamento/fluxo-clinico?etapa=1');

    expect(await screen.findByRole('heading', { name: 'Finalize sua etapa' })).toBeInTheDocument();
    expect(screen.queryByText('Revise documentos')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /abrir documentos/i })).not.toBeInTheDocument();
  });

  it('retoma a etapa indicada no endereço e não abre roteiro restrito ao perfil', async () => {
    mocks.roles = ['enfermagem'];
    const current = renderTreinamento('/treinamento/fluxo-clinico?etapa=1');

    expect(await screen.findByRole('heading', { name: 'Finalize sua etapa' })).toBeVisible();
    expect(screen.getByText('Etapa 2 de 2')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    current.unmount();
    renderTreinamento('/treinamento/financeiro-seguro');
    expect(await screen.findByRole('heading', { name: 'Tutorial não disponível' })).toBeVisible();
  });
});
