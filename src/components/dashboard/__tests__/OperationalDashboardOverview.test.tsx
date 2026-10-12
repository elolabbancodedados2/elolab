import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CalendarDays, ClipboardList } from 'lucide-react';
import { OperationalDashboardOverview } from '../OperationalDashboardOverview';

describe('OperationalDashboardOverview', () => {
  it('prioriza o resumo de rotina e mantém atalhos acessíveis ao perfil', () => {
    render(
      <MemoryRouter>
        <OperationalDashboardOverview
          nome="Ana Costa"
          saudacao="Bom dia"
          dataLabel="segunda-feira, 12 de outubro"
          descricao="Priorize chegada, agenda e comunicação com pacientes."
          isProfileLinked
          metrics={[
            { label: 'Consultas de hoje', value: 8, detail: 'Agendamentos não cancelados.', href: '/agenda' },
            { label: 'Aguardando', value: 2, detail: 'Pacientes aguardando chamada.', href: '/fila' },
            { label: 'Tarefas abertas', value: 3, detail: 'Pendentes ou em andamento na clínica.', href: '/tarefas' },
          ]}
          actions={[
            { label: 'Abrir recepção', href: '/recepcao', icon: ClipboardList },
            { label: 'Agenda de hoje', href: '/agenda', icon: CalendarDays },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Bom dia, Ana' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Resumo da rotina' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Consultas de hoje: 8. Agendamentos não cancelados.' })).toHaveAttribute('href', '/agenda');
    expect(screen.getAllByRole('link', { name: 'Abrir recepção' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Abrir recepção' })[0]).toHaveAttribute('href', '/recepcao');
    expect(screen.getByText('Atualizado automaticamente')).toBeInTheDocument();
  });

  it('explica quando o perfil ainda não está vinculado a uma clínica', () => {
    render(
      <MemoryRouter>
        <OperationalDashboardOverview
          nome="João"
          saudacao="Boa tarde"
          dataLabel="segunda-feira, 12 de outubro"
          descricao="Acesse os módulos disponíveis para o seu perfil."
          metrics={[]}
          actions={[]}
          isProfileLinked={false}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Seu perfil ainda não está vinculado a uma clínica/)).toBeInTheDocument();
  });
});
