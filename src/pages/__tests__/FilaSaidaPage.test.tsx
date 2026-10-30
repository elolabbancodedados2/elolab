import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  profile: { clinica_id: 'clinic-1' },
  record: {
    id: 'fila-1',
    status: 'em_atendimento',
    horario_chegada: '2026-10-30T12:00:00.000Z',
    prioridade: 'normal',
    agendamentos: {
      data: '2026-10-30',
      hora_inicio: '09:00:00',
      status: 'em_atendimento',
      pacientes: { nome: 'Paciente Exemplo', nome_social: null },
      medicos: { nome: 'Dra. Exemplo', crm: '123' },
    },
  },
  queryOptions: null as null | { queryFn: () => Promise<unknown> },
  refetch: vi.fn(),
  invalidateQueries: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: mocks.profile }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: typeof mocks.queryOptions) => {
    mocks.queryOptions = options;
    return { data: mocks.record, isPending: false, isError: false, refetch: mocks.refetch };
  },
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args), rpc: (...args: unknown[]) => mocks.rpc(...args) },
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import FilaSaidaPage from '@/pages/FilaSaidaPage';

function LocationOutput() {
  const location = useLocation();
  return <output data-testid="current-location">{location.pathname}{location.search}</output>;
}

function setup() {
  const router = createMemoryRouter([{
    path: '/fila/:filaId/saida',
    element: <><LocationOutput /><FilaSaidaPage /></>,
  }, {
    path: '/fila',
    element: <LocationOutput />,
  }], {
    initialEntries: [{ pathname: '/fila/fila-1/saida', state: { returnTo: '/fila?tab=fila' } }],
  });
  return { router, ...render(<RouterProvider router={router} />) };
}

describe('FilaSaidaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Element.prototype as Element & { scrollIntoView: () => void }).scrollIntoView = vi.fn();
    mocks.profile = { clinica_id: 'clinic-1' };
    mocks.record = {
      id: 'fila-1', status: 'em_atendimento', horario_chegada: '2026-10-30T12:00:00.000Z', prioridade: 'normal',
      agendamentos: {
        data: '2026-10-30', hora_inicio: '09:00:00', status: 'em_atendimento',
        pacientes: { nome: 'Paciente Exemplo', nome_social: null }, medicos: { nome: 'Dra. Exemplo', crm: '123' },
      },
    };
    mocks.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: mocks.record, error: null }) });
    mocks.rpc.mockResolvedValue({ data: { removido: true, atendimento_reaberto: true }, error: null });
  });

  afterEach(() => vi.restoreAllMocks());

  it('carrega um item no escopo da clínica e envia a remoção com status esperado e motivo', async () => {
    setup();

    expect(await screen.findByRole('heading', { name: 'Remover paciente da fila' })).toBeInTheDocument();
    expect(screen.getByText('Paciente Exemplo')).toBeInTheDocument();
    expect(mocks.queryOptions).not.toBeNull();
    await expect(mocks.queryOptions!.queryFn()).resolves.toEqual(mocks.record);
    expect(mocks.from).toHaveBeenCalledWith('fila_atendimento');
    expect(mocks.from.mock.results[0].value.eq).toHaveBeenNthCalledWith(1, 'id', 'fila-1');
    expect(mocks.from.mock.results[0].value.eq).toHaveBeenNthCalledWith(2, 'clinica_id', 'clinic-1');

    fireEvent.click(screen.getByRole('combobox', { name: 'Motivo da saída' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Paciente desistiu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('remover_item_fila_com_motivo', {
      p_fila_id: 'fila-1', p_status_esperado: 'em_atendimento', p_motivo: 'paciente_desistiu',
    }));
    expect(await screen.findByTestId('current-location')).toHaveTextContent('/fila?tab=fila');
    expect(mocks.toast.info).toHaveBeenCalledWith('Paciente removido da fila', expect.objectContaining({ description: expect.stringContaining('voltou para') }));
  });

  it('mostra a consequência de devolver um atendimento em andamento à recepção', async () => {
    setup();

    expect(await screen.findByText(/atendimento em andamento voltará para “aguardando”/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar remoção' })).toBeDisabled();
  });

  it('recusa uma URL de item que não está mais disponível', async () => {
    mocks.record = null as unknown as typeof mocks.record;
    setup();

    expect(await screen.findByRole('heading', { name: 'Este paciente não está mais na fila' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar remoção' })).not.toBeInTheDocument();
  });

  it('preserva o motivo escolhido quando a RPC falha sem mudar o item', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('Falha de rede') });
    mocks.refetch.mockResolvedValue({ data: mocks.record });
    setup();

    await screen.findByRole('heading', { name: 'Remover paciente da fila' });
    fireEvent.click(screen.getByRole('combobox', { name: 'Motivo da saída' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Paciente desistiu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('Não foi possível remover da fila', expect.objectContaining({ description: 'Falha de rede' })));
    expect(screen.getByRole('combobox', { name: 'Motivo da saída' })).toHaveTextContent('Paciente desistiu');
    expect(screen.getByTestId('current-location')).toHaveTextContent('/fila/fila-1/saida');
  });
});
