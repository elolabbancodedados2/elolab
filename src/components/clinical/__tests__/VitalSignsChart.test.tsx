import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ triagens: [] as any[] }));

vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: mocks.triagens, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: { id: 'user-1' }, profile: { clinica_id: 'clinica-1' } }) }));
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

import { VitalSignsChart } from '@/components/clinical/VitalSignsChart';

describe('VitalSignsChart', () => {
  beforeEach(() => {
    mocks.triagens = [{
      id: 'triagem-1',
      data_hora: '2026-10-14T12:00:00Z',
      pressao_arterial: null,
      frequencia_cardiaca: null,
      temperatura: null,
      peso: null,
      altura: null,
      saturacao: null,
      frequencia_respiratoria: null,
    }];
  });

  it('identifica sinais sem medição como não aferidos', () => {
    render(<VitalSignsChart pacienteId="paciente-1" />);

    expect(screen.getAllByText('Não aferido')).toHaveLength(4);
  });

  it('não troca zero por ausência de medição', () => {
    mocks.triagens[0] = { ...mocks.triagens[0], frequencia_cardiaca: 0, temperatura: 0, peso: 0 };
    render(<VitalSignsChart pacienteId="paciente-1" />);

    expect(screen.getByText('0 bpm')).toBeInTheDocument();
    expect(screen.getByText('0 °C')).toBeInTheDocument();
    expect(screen.getByText('0 kg')).toBeInTheDocument();
    expect(screen.getAllByText('Não aferido')).toHaveLength(1);
  });
});
