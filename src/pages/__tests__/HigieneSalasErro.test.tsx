import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ data: undefined as unknown, error: null as unknown }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: estado.data, error: estado.error, isLoading: false, isFetching: false, refetch: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: { clinica_id: 'clinic-1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import HigieneSalas from '../HigieneSalas';

const renderizar = () => render(<MemoryRouter><HigieneSalas /></MemoryRouter>);
const dados = { rooms: [], activeChecklistId: null, checklists: [], executions: [], reviews: [], canReview: false, canConfigure: false };

afterEach(() => { estado.data = undefined; estado.error = null; });

describe('HigieneSalas: falha de atualização', () => {
  it('sem dados, pausa a tela com o estado de erro', () => {
    estado.error = new Error('rede');
    renderizar();
    expect(screen.getByText('Não foi possível carregar a higienização')).toBeInTheDocument();
  });

  it('com dados na tela, mantém o checklist e mostra aviso discreto', () => {
    estado.data = dados;
    estado.error = new Error('rede');
    renderizar();
    expect(screen.queryByText('Não foi possível carregar a higienização')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Higienização de salas' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('pode estar desatualizado');
  });
});
