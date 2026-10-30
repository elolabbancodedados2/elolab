import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  role: 'admin',
  type: 'pagamento',
  context: null as unknown,
  writePayloads: [] as unknown[],
  writeFilters: [] as unknown[][],
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  invalidateQueries: vi.fn(async () => undefined),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({
    profile: { id: 'staff-1', clinica_id: 'clinic-1' },
    hasAnyRole: (roles: string[]) => roles.includes(mocks.role),
  }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args), rpc: (...args: unknown[]) => mocks.rpc(...args) },
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mocks.context, isLoading: false, isError: false, error: null, refetch: vi.fn(async () => ({ data: mocks.context })) }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, info: mocks.toastInfo } }));
vi.mock('@/components/UnsavedChangesGuard', () => ({ UnsavedChangesGuard: () => null }));

import LiberarAtendimentoPage from '@/pages/LiberarAtendimentoPage';

function LocationOutput() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function makeContext(type: string) {
  return {
    appointment: {
      id: 'appointment-1', clinica_id: 'clinic-1', data: '2026-10-30', hora_inicio: '09:30:00', status: 'aguardando',
      exige_pagamento_previo: true, liberado_sem_pagamento: false,
      exige_triagem: true, liberado_sem_triagem: false,
      pacientes: { nome: 'Ana', nome_social: null }, medicos: { nome: 'Dra. Marina' },
    },
    queue: { id: 'queue-1', status: 'aguardando', cobranca_estado: 'confirmada' },
    eligible: true,
    alreadyReleased: false,
    reason: '',
    type,
  };
}

type MockQuery = {
  select: (...args: unknown[]) => MockQuery;
  eq: (column: string, value: unknown) => MockQuery;
  in: (...args: unknown[]) => MockQuery;
  order: (...args: unknown[]) => MockQuery;
  limit: (...args: unknown[]) => MockQuery;
  update: (payload: unknown) => MockQuery;
  maybeSingle: () => Promise<{ data: unknown; error: null }>;
};

function setup(type = 'pagamento') {
  mocks.type = type;
  const context = makeContext(type);
  mocks.context = context;
  const appointment = context.appointment;
  const queue = context.queue;
  mocks.from.mockImplementation((table: string) => {
    let operation: 'select' | 'update' = 'select';
    const query: MockQuery = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        if (operation === 'update') mocks.writeFilters.push([column, value]);
        return query;
      }),
      in: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      update: vi.fn((payload: unknown) => { operation = 'update'; mocks.writePayloads.push(payload); return query; }),
      maybeSingle: vi.fn(async () => {
        if (operation === 'update') return { data: { id: 'appointment-1' }, error: null };
        if (table === 'agendamentos') return { data: appointment, error: null };
        if (table === 'clinicas') return { data: { exigir_pagamento_previo: true, exigir_triagem: true }, error: null };
        if (table === 'fila_atendimento') return { data: queue, error: null };
        return { data: null, error: null };
      }),
    };
    return query;
  });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === 'verificar_pagamento_fila'
      ? [{ agendamento_id: 'appointment-1', pode_atender: false }]
      : [],
    error: null,
  }));

  return render(
    <MemoryRouter initialEntries={[{
      pathname: `/fila/appointment-1/liberacao/${type}`,
      state: { returnTo: '/fila?tab=fila', patientName: 'Ana' },
    }]}>
      <LocationOutput />
      <Routes>
        <Route path="/fila/:agendamentoId/liberacao/:tipo" element={<LiberarAtendimentoPage />} />
        <Route path="/fila" element={<p>Fila operacional</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Liberação excepcional da fila', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = 'admin';
    mocks.writePayloads = [];
    mocks.writeFilters = [];
  });

  it.each(['pagamento', 'triagem'])('registra %s em página própria com escopo e justificativa', async type => {
    setup(type);
    expect(screen.getByTestId('fila-exceptional-release-page')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Registrar liberação' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'ok' } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'Urgência assistencial' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByText('Fila operacional')).toBeInTheDocument());
    const payload = mocks.writePayloads[0] as Record<string, unknown>;
    expect(payload[type === 'pagamento' ? 'liberado_sem_pagamento' : 'liberado_sem_triagem']).toBe(true);
    expect(payload[type === 'pagamento' ? 'motivo_liberacao' : 'liberado_sem_triagem_motivo']).toBe('Urgência assistencial');
    expect(mocks.writeFilters).toContainEqual(['id', 'appointment-1']);
    expect(mocks.writeFilters).toContainEqual(['clinica_id', 'clinic-1']);
    expect(mocks.writeFilters).toContainEqual([type === 'pagamento' ? 'liberado_sem_pagamento' : 'liberado_sem_triagem', false]);
    expect(mocks.toastSuccess).toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/fila?tab=fila');
  });

  it('bloqueia quem não é médico nem administrador', () => {
    mocks.role = 'enfermagem';
    setup();
    expect(screen.getByText('Sem permissão para esta operação')).toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
