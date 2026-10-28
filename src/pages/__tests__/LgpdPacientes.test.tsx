import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ habilitada: false }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/useBuscaPacientes', () => ({
  useBuscaPacientes: () => ({
    // Dados sintéticos.
    data: {
      pacientes: [{ id: '11111111-1111-4111-8111-111111111111', nome: 'Paciente Sintético', cpf: null, email: null }],
      incompleta: false,
    },
    refetch: vi.fn(),
    isLoading: false,
    isDebouncing: false,
    error: null,
  }),
}));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { clinica_id: '22222222-2222-4222-8222-222222222222' } }),
}));
vi.mock('@/lib/lgpdCompliance', async (orig) => {
  const real = await orig<typeof import('@/lib/lgpdCompliance')>();
  return {
    ...real,
    get ANONIMIZACAO_LGPD_HABILITADA() {
      return mocks.habilitada;
    },
  };
});

import LgpdPacientes from '../LgpdPacientes';

function renderizar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LgpdPacientes />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('LgpdPacientes', () => {
  it('com a trava desligada só oferece exportar e registrar o pedido', () => {
    mocks.habilitada = false;
    renderizar();
    expect(screen.getByRole('button', { name: /Solicitar exclusão/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Anonimizar$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Apagar/ })).not.toBeInTheDocument();
  });

  it('com a trava ligada oferece a anonimização', () => {
    mocks.habilitada = true;
    renderizar();
    expect(screen.getByRole('button', { name: /^Anonimizar$/ })).toBeInTheDocument();
  });
});
