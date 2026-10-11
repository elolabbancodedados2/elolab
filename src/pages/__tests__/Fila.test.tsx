import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';

interface AppointmentFixture {
  id: string;
  paciente_id: string;
  medico_id: string;
  data: string;
  hora_inicio: string;
  tipo: string;
  status: string;
  observacoes: null;
  sala_id: null;
  pacientes: { nome: string };
  medicos: { nome: string; crm: string };
}

interface QueueFixture {
  id: string;
  agendamento_id: string;
  status: string;
  cobranca_estado: string;
  prioridade: string;
  posicao: number;
  horario_chegada: string;
  sala_id: null;
  created_at: string;
  updated_at: string;
  agendamentos: AppointmentFixture;
}

const mocks = vi.hoisted(() => ({
  role: 'enfermagem',
  fila: [] as QueueFixture[],
  agendamentos: [] as AppointmentFixture[],
  queryResults: {} as Record<string, { data?: unknown; isLoading?: boolean; isError?: boolean }>,
  updateResult: { data: [] as { id: string }[], error: null as null },
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
  invalidateQueries: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({
    profile: { id: 'staff-1', clinica_id: 'clinic-1' },
    hasAnyRole: (roles: string[]) => roles.includes(mocks.role),
  }),
}));

vi.mock('@/hooks/useSupabaseData', () => ({
  useFilaAtendimento: () => ({ data: mocks.fila, isLoading: false }),
  useAgendamentos: () => ({ data: mocks.agendamentos, isLoading: false }),
  usePacientes: () => ({ data: [], isLoading: false }),
  useMedicos: () => ({ data: [], isLoading: false }),
  useSalas: () => ({ data: [], isLoading: false }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => mocks.queryResults[String(queryKey[0])] ?? { data: [], isLoading: false, isError: false },
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/hooks/useCurrentMedico', () => ({ useCurrentMedico: () => ({ medicoId: null, isMedicoOnly: false, currentMedico: null }) }));
vi.mock('framer-motion', () => ({
  motion: { div: ({ children }: { children: React.ReactNode }) => children },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/fila/FinalizarAtendimentoDialog', () => ({ FinalizarAtendimentoDialog: () => null }));

import Fila from '@/pages/Fila';

const hoje = todaySaoPauloDateOnly();
const ontemDate = new Date(`${hoje}T00:00:00Z`);
ontemDate.setUTCDate(ontemDate.getUTCDate() - 1);
const ontem = ontemDate.toISOString().slice(0, 10);

function agendamento(id: string, nome: string, data = hoje, status = 'aguardando'): AppointmentFixture {
  return {
    id,
    paciente_id: `patient-${id}`,
    medico_id: `doctor-${id}`,
    data,
    hora_inicio: '09:00:00',
    tipo: 'Consulta',
    status,
    observacoes: null,
    sala_id: null,
    pacientes: { nome },
    medicos: { nome: 'Profissional', crm: '123' },
  };
}

function item(id: string, appointment: AppointmentFixture, status = 'aguardando'): QueueFixture {
  return {
    id: `queue-${id}`,
    agendamento_id: appointment.id,
    status,
    cobranca_estado: 'confirmada',
    prioridade: 'normal',
    posicao: 1,
    horario_chegada: new Date().toISOString(),
    sala_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    agendamentos: appointment,
  };
}

function setup() {
  return render(<MemoryRouter><Fila /></MemoryRouter>);
}

describe('Fila de atendimento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = 'enfermagem';
    const espera = agendamento('today', 'Paciente de hoje');
    const bloqueado = agendamento('blocked', 'Paciente aguardando balcão');
    const cancelado = agendamento('cancelled', 'Paciente cancelado', hoje, 'cancelado');
    const antigo = agendamento('old', 'Paciente de ontem', ontem, 'aguardando');
    mocks.fila = [item('today', espera), item('blocked', bloqueado), item('cancelled', cancelado), item('old', antigo)];
    mocks.agendamentos = [espera, bloqueado, cancelado];
    mocks.queryResults = {
      'fila-cobrancas': { data: [], isLoading: false, isError: false },
      'clinica-exige-pagamento': { data: { exigir_pagamento_previo: true, exigir_triagem: false }, isLoading: false, isError: false },
      'fila-liberacao-pagamento': {
        data: [
          { agendamento_id: 'today', pode_atender: true },
          { agendamento_id: 'blocked', pode_atender: false },
          { agendamento_id: 'cancelled', pode_atender: true },
        ],
        isLoading: false,
        isError: false,
      },
      'fila-triagens': { data: [], isLoading: false, isError: false },
    };
    mocks.updateResult = { data: [], error: null };
    mocks.from.mockImplementation(() => {
      const updateQuery = {
        eq: vi.fn(() => updateQuery),
        select: vi.fn(async () => mocks.updateResult),
      };
      return { update: vi.fn(() => updateQuery) };
    });
  });

  it('separa agendamentos antigos e encerrados, e não expõe valor financeiro à enfermagem', () => {
    setup();

    expect(screen.getByRole('heading', { name: 'Itens fora da fila ativa' })).toBeInTheDocument();
    expect(screen.getByText('Paciente de ontem')).toBeInTheDocument();
    expect(screen.getByText('Paciente cancelado')).toBeInTheDocument();
    expect(screen.getByText('Paciente aguardando balcão')).toBeInTheDocument();
    expect(screen.getByText('Pendente no balcão')).toBeInTheDocument();
    expect(screen.queryByText(/R\$\s*\d/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover da fila' })).not.toBeInTheDocument();
  });

  it('não chama o paciente quando a atualização condicional encontra uma fila alterada', async () => {
    const espera = agendamento('today', 'Paciente de hoje', hoje, 'confirmado');
    mocks.fila = [item('today', espera)];
    mocks.agendamentos = [espera];
    mocks.queryResults['clinica-exige-pagamento'] = {
      data: { exigir_pagamento_previo: false, exigir_triagem: false }, isLoading: false, isError: false,
    };
    setup();

    fireEvent.click(screen.getByRole('button', { name: /chamar/i }));
    await waitFor(() => expect(mocks.toast.warning).toHaveBeenCalledWith('A fila mudou. Atualize a tela antes de chamar este paciente.'));
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });
});
