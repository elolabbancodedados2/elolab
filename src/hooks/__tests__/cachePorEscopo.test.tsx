import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'user-1' }, profile: { clinica_id: 'clinica-a' } },
  from: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => mocks.auth }));
vi.mock('@/lib/auditTrail', () => ({ logAudit: vi.fn() }));

import { useSupabaseQuery } from '@/hooks/useSupabaseData';

afterEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { id: 'user-1' };
  mocks.auth.profile = { clinica_id: 'clinica-a' };
});

describe('cache de consultas por escopo', () => {
  it('não mantém dados da clínica anterior enquanto a nova consulta está pendente', async () => {
    let liberarClinicaB!: (resultado: { data: Array<{ id: string }>; error: null }) => void;
    const respostaClinicaB = new Promise<{ data: Array<{ id: string }>; error: null }>((resolve) => {
      liberarClinicaB = resolve;
    });
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn(() => mocks.auth.profile.clinica_id === 'clinica-a'
        ? Promise.resolve({ data: [{ id: 'clinica-a' }], error: null })
        : respostaClinicaB),
    };
    mocks.from.mockReturnValue(query);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      () => useSupabaseQuery<{ id: string }>('pacientes', { orderBy: { column: 'nome' }, keepPrevious: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual([{ id: 'clinica-a' }]));
    mocks.auth.profile.clinica_id = 'clinica-b';
    rerender();

    expect(result.current.data).toBeUndefined();
    liberarClinicaB({ data: [{ id: 'clinica-b' }], error: null });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'clinica-b' }]));

    queryClient.clear();
  });

  it('não reapresenta dados do usuário anterior quando a clínica é a mesma', async () => {
    mocks.auth.user = { id: 'user-1' };
    mocks.auth.profile = { clinica_id: 'clinica-compartilhada' };
    let liberarUsuario2!: (resultado: { data: Array<{ id: string }>; error: null }) => void;
    const respostaUsuario2 = new Promise<{ data: Array<{ id: string }>; error: null }>((resolve) => {
      liberarUsuario2 = resolve;
    });
    const query = {
      select: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn(() => mocks.auth.user?.id === 'user-1'
        ? Promise.resolve({ data: [{ id: 'user-1-data' }], error: null })
        : respostaUsuario2),
    };
    mocks.from.mockReturnValue(query);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      () => useSupabaseQuery<{ id: string }>('pacientes', { orderBy: { column: 'nome' }, keepPrevious: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual([{ id: 'user-1-data' }]));
    mocks.auth.user = { id: 'user-2' };
    rerender();

    expect(result.current.data).toBeUndefined();
    liberarUsuario2({ data: [{ id: 'user-2-data' }], error: null });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'user-2-data' }]));

    queryClient.clear();
  });
});
