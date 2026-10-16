import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(),
  auth: { user: { id: 'user-1' }, profile: { clinica_id: 'clinic-1', roles: ['recepcao'] } },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: mocks }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => mocks.auth }));

import { buscarPacientes, useBuscaPacientes } from '@/hooks/useBuscaPacientes';

const patient = (id: string) => ({
  id, nome: `Paciente ${id}`, nome_social: null, cpf: null, telefone: null,
  email: null, data_nascimento: null, convenio_id: null, ativo: true,
});
const response = (data: ReturnType<typeof patient>[], error: unknown = null) => {
  const result = { data, error };
  return { select: vi.fn(async () => result), then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = { user: { id: 'user-1' }, profile: { clinica_id: 'clinic-1', roles: ['recepcao'] } };
  mocks.rpc.mockReturnValue(response([]));
  const legacy: any = {
    select: () => legacy, eq: () => legacy, or: () => legacy, order: () => legacy,
    range: async () => ({ data: [], error: null }),
  };
  mocks.from.mockReturnValue(legacy);
});

describe('patient search API', () => {
  it('returns server matches without downloading and filtering candidate pages', async () => {
    const found = { ...patient('1'), nome: 'João da Silva' };
    mocks.rpc.mockReturnValue(response([found]));
    await expect(buscarPacientes(' joao ', 20)).resolves.toEqual({ pacientes: [found], incompleta: false });
    expect(mocks.rpc).toHaveBeenCalledWith('buscar_pacientes_paginado', expect.objectContaining({
      p_termo: 'joao', p_limite: 21, p_offset: 0, p_status: 'ativos',
    }));
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('requests only the second page plus one lookahead and never earlier pages', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => patient(String(50 + i)));
    mocks.rpc.mockReturnValue(response(rows));
    await expect(buscarPacientes('', 50, {}, false, undefined, 'ativos', 1))
      .resolves.toEqual({ pacientes: rows.slice(0, 50), incompleta: true });
    expect(mocks.rpc).toHaveBeenCalledWith('buscar_pacientes_paginado', expect.objectContaining({
      p_termo: null, p_limite: 51, p_offset: 50,
    }));
  });

  it('passes status, demographic filters and private coverage to the server', async () => {
    await buscarPacientes('ana', 20, {
      sexo: 'F', convenio: 'particular', nascimentoApos: '2000-01-01', nascimentoAte: '2010-12-31',
    }, false, undefined, 'inativos');
    expect(mocks.rpc).toHaveBeenCalledWith('buscar_pacientes_paginado', expect.objectContaining({
      p_status: 'inativos', p_sexo: 'F', p_convenio_id: null, p_somente_particular: true,
      p_nascimento_apos: '2000-01-01', p_nascimento_ate: '2010-12-31',
    }));
  });

  it('preserves the minimal projection requested by the privacy screen', async () => {
    const query = response([]);
    mocks.rpc.mockReturnValue(query);
    await buscarPacientes('ana', 30, { convenio: 'convenio-1' }, false, 'id,nome,cpf,email', 'todos');
    expect(query.select).toHaveBeenCalledWith('id,nome,cpf,email');
    expect(mocks.rpc).toHaveBeenCalledWith('buscar_pacientes_paginado', expect.objectContaining({
      p_convenio_id: 'convenio-1', p_somente_particular: false, p_status: 'todos',
    }));
  });

  it('propagates API errors instead of showing an empty successful search', async () => {
    const error = { code: '42501', message: 'permission denied' };
    mocks.rpc.mockReturnValue(response([], error));
    await expect(buscarPacientes('ana')).rejects.toBe(error);
  });

  it('keeps financial-only access on its restricted endpoint', async () => {
    mocks.rpc.mockReturnValue(response([patient('1')]));
    await expect(buscarPacientes('ana', 20, {}, true)).resolves.toEqual({ pacientes: [patient('1')], incompleta: false });
    expect(mocks.rpc).toHaveBeenCalledWith('buscar_pacientes_resumo_financeiro', expect.objectContaining({ p_termo: 'ana', p_limite: 21 }));
  });

  it.each(['clinic', 'user'] as const)('does not reuse another %s patient cache', async (scope) => {
    let finish!: (value: { data: ReturnType<typeof patient>[]; error: null }) => void;
    const pending = new Promise((resolve) => { finish = resolve; });
    mocks.rpc.mockReturnValueOnce(response([patient('old')])).mockReturnValue({ select: () => pending });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const hook = renderHook(() => useBuscaPacientes('ana'), { wrapper });
    await waitFor(() => expect(hook.result.current.data?.pacientes).toEqual([patient('old')]));
    if (scope === 'clinic') mocks.auth.profile.clinica_id = 'clinic-2';
    else mocks.auth.user.id = 'user-2';
    hook.rerender();
    expect(hook.result.current.data).toBeUndefined();
    finish({ data: [], error: null });
    await waitFor(() => expect(hook.result.current.data?.pacientes).toEqual([]));
    hook.unmount();
    client.clear();
  });

  it('changes the request and cached result when navigating pages', async () => {
    mocks.rpc.mockReturnValueOnce(response([patient('page-0')])).mockReturnValue(response([patient('page-1')]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const hook = renderHook(({ pagina }) => useBuscaPacientes('', { limite: 50, pagina }), { wrapper, initialProps: { pagina: 0 } });
    await waitFor(() => expect(hook.result.current.data?.pacientes[0].id).toBe('page-0'));
    hook.rerender({ pagina: 1 });
    await waitFor(() => expect(hook.result.current.data?.pacientes[0].id).toBe('page-1'));
    expect(mocks.rpc).toHaveBeenLastCalledWith('buscar_pacientes_paginado', expect.objectContaining({ p_offset: 50, p_limite: 51 }));
    hook.unmount();
    client.clear();
  });

  it('does not repeat an initial request because of surrounding whitespace', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const hook = renderHook(() => useBuscaPacientes('  Ana  '), { wrapper });
    expect(hook.result.current.isDebouncing).toBe(false);
    await waitFor(() => expect(hook.result.current.data?.pacientes).toEqual([]));
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    hook.unmount();
    client.clear();
  });
});
