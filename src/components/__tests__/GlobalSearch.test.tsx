import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

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
  supabase: { rpc: vi.fn(async () => ({ data: [], error: null })) },
}));

import { GlobalSearch } from '../GlobalSearch';

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
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
