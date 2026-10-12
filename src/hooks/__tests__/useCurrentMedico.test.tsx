import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';

const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: 'user-1', email: 'doctor@example.com' } as { id: string; email: string },
    profile: { clinica_id: 'clinic-1', roles: ['medico'] as string[] },
    hasRole: vi.fn(),
    isAdmin: vi.fn(),
  },
  rpc: vi.fn(),
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));

import { useCurrentMedico } from '../useCurrentMedico';

describe('useCurrentMedico', () => {
  beforeEach(() => {
    mocks.auth.user = { id: 'user-1', email: 'doctor@example.com' };
    mocks.auth.profile = { clinica_id: 'clinic-1', roles: ['medico'] };
    mocks.auth.hasRole.mockImplementation((role: string) => mocks.auth.profile.roles.includes(role));
    mocks.auth.isAdmin.mockImplementation(() => mocks.auth.profile.roles.includes('admin'));
    mocks.rpc.mockResolvedValue({ data: [{ id: 'med-1', nome: 'Dra. Teste' }], error: null });
  });

  const render = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderHook(() => useCurrentMedico(), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });
  };

  it('restringe médicos sem função administrativa ou operacional à própria agenda', async () => {
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.medicoId).toBe('med-1'));
    expect(result.current.isMedicoOnly).toBe(true);

    mocks.auth.profile = { clinica_id: 'clinic-1', roles: ['medico', 'recepcao'] };
    rerender();
    expect(result.current.isMedicoOnly).toBe(false);
  });

  it('resolve o médico atual por RPC e não por e-mail', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const { result } = render();

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('buscar_medico_atual'));
    expect(result.current.medicoId).toBeNull();
    expect(result.current.currentMedico).toBeNull();
  });

  it('expõe falhas e permite tentar carregar o vínculo novamente', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('network unavailable') });
    const { result } = render();

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.isLoading).toBe(false);

    mocks.rpc.mockResolvedValueOnce({ data: [{ id: 'med-2', nome: 'Dr. Retorno' }], error: null });
    await result.current.refetch();

    await waitFor(() => expect(result.current.medicoId).toBe('med-2'));
    expect(result.current.error).toBeNull();
  });
});
