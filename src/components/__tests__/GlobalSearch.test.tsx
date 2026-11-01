import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ data: [], error: null })) }));

let roles: string[] = ['financeiro'];
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({
    profile: { clinica_id: 'c1', roles },
    isAdmin: () => roles.includes('admin'),
    isSuperAdmin: false,
  }),
}));
vi.mock('@/hooks/useSubscriptionPlan', () => ({
  useUserPlan: () => ({ hasFeature: () => false, isLoading: false, isError: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mocks.rpc },
}));

import { GlobalSearch } from '../GlobalSearch';

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});

function abrirEBuscar(termo: string) {
  render(<MemoryRouter><GlobalSearch /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: /abrir busca global/i }));
  fireEvent.change(screen.getByPlaceholderText(/nome, cpf/i), { target: { value: termo } });
  return screen.getByRole('dialog');
}

describe('GlobalSearch — módulos', () => {
  it('rotula destinos como módulo e segue o mesmo filtro do menu real', () => {
    roles = ['financeiro'];
    const dialog = abrirEBuscar('repasses');
    const item = within(dialog).getByRole('option', { name: /repasses médicos/i });
    expect(within(item).getByText('Módulo')).toBeInTheDocument();
    expect(within(item).getByText('Financeiro')).toBeInTheDocument();
  });

  it('recupera de uma falha de rede e permite tentar a busca novamente', async () => {
    roles = ['admin'];
    mocks.rpc.mockRejectedValueOnce(new Error('offline'));
    const dialog = abrirEBuscar('ana');

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Não foi possível buscar.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tentar novamente' }));
    await within(dialog).findByText('Nenhum resultado encontrado nesta clínica.');
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it('mostra paciente encontrado por CPF mesmo sem o termo no nome e nomeia o diálogo', async () => {
    roles = ['admin'];
    mocks.rpc.mockResolvedValue({
      data: [{ tipo: 'paciente', id: 'p1', titulo: 'Ana Souza', subtitulo: 'Paciente', href: '/pacientes/p1', data_referencia: null }],
      error: null,
    });
    const dialog = abrirEBuscar('123.456');
    expect(dialog).toHaveAccessibleName('Busca global');
    expect(await within(dialog).findByRole('option', { name: /ana souza/i })).toBeInTheDocument();
  });

  it('não oferece módulos fora do perfil', () => {
    roles = ['financeiro'];
    const dialog = abrirEBuscar('prontu');
    expect(within(dialog).queryByRole('option', { name: /prontuários/i })).not.toBeInTheDocument();
  });

  it('não oferece módulos que dependem de recurso fora do plano', () => {
    roles = ['admin'];
    const dialog = abrirEBuscar('exames');
    expect(within(dialog).queryByRole('option', { name: /^exames/i })).not.toBeInTheDocument();
  });
});
