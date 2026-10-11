import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminDashboardOverview } from '../AdminDashboardOverview';
import { formatAppointmentStatus } from '../appointmentStatus';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe('AdminDashboardOverview', () => {
  it('mantém o status real do atendimento em português', () => {
    expect(formatAppointmentStatus('em_atendimento')).toBe('Em atendimento');
    expect(formatAppointmentStatus('finalizado')).toBe('Finalizado');
    expect(formatAppointmentStatus('confirmado')).toBe('Confirmado');
    expect(formatAppointmentStatus('aguardando_triagem')).toBe('Aguardando triagem');
  });

  it('organiza o resumo, a agenda e as pendências em áreas reconhecíveis', () => {
    renderOverview();

    expect(screen.getByRole('heading', { name: 'Bom dia, Ana' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sua agenda de hoje' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Agenda de hoje' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Precisa de atenção' })).toBeInTheDocument();
    expect(screen.getByText('R$ 1.250,00')).toBeInTheDocument();

    const agenda = screen.getByRole('region', { name: 'Agenda de hoje' });
    expect(within(agenda).getByText('Mariana Costa')).toBeInTheDocument();
    expect(within(agenda).getByText('Rafael Lima')).toBeInTheDocument();
    expect(screen.getByText('2 aguardando atendimento')).toBeInTheDocument();
  });

  it('oferece saída para agendar quando o dia não tem consultas', () => {
    renderOverview({ agenda: [] });

    const agenda = screen.getByRole('region', { name: 'Agenda de hoje' });
    expect(within(agenda).getByText('Nenhuma consulta agendada para hoje')).toBeInTheDocument();
    expect(within(agenda).getByRole('link', { name: /agendar consulta/i })).toHaveAttribute('href', '/agenda');
  });

  it('leva à agenda pela ação principal de novo atendimento', () => {
    renderOverview();
    expect(screen.getByRole('link', { name: 'Novo atendimento' })).toHaveAttribute('href', '/agenda');
  });
});

const props = {
  nome: 'Ana',
  dataLabel: 'segunda-feira, 10 de outubro',
  horarioLabel: '09:30',
  metricas: {
    consultas: 8,
    fila: 2,
    finalizadas: 3,
    receita: 'R$ 1.250,00',
  },
  agenda: [
    { id: 'ag-1', horario: '10:00', paciente: 'Mariana Costa', tipo: 'Consulta', status: 'Confirmado' },
    { id: 'ag-2', horario: '11:30', paciente: 'Rafael Lima', tipo: 'Retorno', status: 'Agendado' },
  ],
  alertas: [
    { id: 'fila', titulo: 'Pacientes na fila', detalhe: '2 aguardando atendimento', href: '/fila', tom: 'attention' as const },
    { id: 'estoque', titulo: 'Estoque baixo', detalhe: '1 item precisa de reposição', href: '/estoque', tom: 'info' as const },
  ],
  desempenho: { percentual: 38, descricao: '3 de 8 consultas finalizadas' },
  fluxoFinanceiro: [{ name: 'Out', receitas: 1250, despesas: 420, lucro: 830 }],
  acoes: [
    { label: 'Agendar consulta', href: '/agenda', icon: 'calendar' as const },
    { label: 'Novo paciente', href: '/pacientes', icon: 'patient' as const },
  ],
};

function renderOverview(overrides: Partial<typeof props> = {}) {
  return render(
    <MemoryRouter>
      <AdminDashboardOverview {...props} {...overrides} />
    </MemoryRouter>,
  );
}

