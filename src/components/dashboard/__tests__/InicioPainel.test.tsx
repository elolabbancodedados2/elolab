import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { InicioPainel } from '../InicioPainel';

describe('InicioPainel', () => {
  it('mostra o resumo do dia e as áreas da tela de Início', () => {
    renderPainel();

    expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument();
    expect(screen.getByText('R$ 1.250,00')).toBeInTheDocument();
    for (const area of ['Na sala de espera', 'Precisa de atenção', 'Agenda de hoje', 'Recebimentos', 'Confirmar consultas de amanhã', 'Minhas tarefas', 'Aniversariantes']) {
      expect(screen.getByRole('heading', { name: area })).toBeInTheDocument();
    }
    expect(screen.getByRole('progressbar', { name: 'Atendimentos concluídos' })).toHaveAttribute('aria-valuenow', '38');
  });

  it('lista a agenda de hoje com o fluxo por situação', () => {
    renderPainel();

    const agenda = screen.getByRole('region', { name: 'Agenda de hoje' });
    expect(within(agenda).getByText('Mariana Costa')).toBeInTheDocument();
    expect(within(agenda).getByText('Rafael Lima')).toBeInTheDocument();
    expect(within(agenda).getByRole('img', { name: 'Confirmado: 1, Agendado: 1' })).toBeInTheDocument();
  });

  it('oferece agendar quando o dia não tem consultas', () => {
    renderPainel({ agenda: [] });

    const agenda = screen.getByRole('region', { name: 'Agenda de hoje' });
    expect(within(agenda).getByText(/Nenhuma consulta agendada para hoje/)).toBeInTheDocument();
    expect(within(agenda).getByRole('link', { name: 'Agendar consulta' })).toHaveAttribute('href', '/agenda');
  });

  it('mostra a sala de espera e atualiza a fila', () => {
    const onAtualizarFila = vi.fn();
    renderPainel({ onAtualizarFila });

    const fila = screen.getByRole('region', { name: 'Na sala de espera' });
    expect(within(fila).getByText('Joana Albuquerque')).toBeInTheDocument();
    expect(within(fila).getByText('urgente')).toBeInTheDocument();
    within(fila).getByRole('button', { name: /atualizar/i }).click();
    expect(onAtualizarFila).toHaveBeenCalledTimes(1);
  });

  it('leva cada alerta à tela que resolve', () => {
    renderPainel();

    const atencao = screen.getByRole('region', { name: 'Precisa de atenção' });
    expect(within(atencao).getByRole('link', { name: /Estoque baixo/ })).toHaveAttribute('href', '/estoque');
  });

  it('mostra o erro só na área que falhou e mantém as outras', () => {
    const tentarAgenda = vi.fn();
    renderPainel({ falhas: { agenda: tentarAgenda } });

    const agenda = screen.getByRole('region', { name: 'Agenda de hoje' });
    expect(within(agenda).getByText('Não foi possível carregar esta área.')).toBeInTheDocument();
    expect(within(agenda).queryByText('Mariana Costa')).not.toBeInTheDocument();
    within(agenda).getByRole('button', { name: 'Tentar de novo' }).click();
    expect(tentarAgenda).toHaveBeenCalledTimes(1);

    const fila = screen.getByRole('region', { name: 'Na sala de espera' });
    expect(within(fila).getByText('Joana Albuquerque')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.250,00')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Tentar de novo' })).toHaveLength(1);
  });

  it('mantém as pendências conhecidas quando parte delas não carregou', () => {
    renderPainel({ falhas: { atencao: vi.fn() } });

    const atencao = screen.getByRole('region', { name: 'Precisa de atenção' });
    expect(within(atencao).getByText('Algumas pendências não puderam ser verificadas.')).toBeInTheDocument();
    expect(within(atencao).getByRole('link', { name: /Estoque baixo/ })).toBeInTheDocument();
  });
});

const props = {
  nome: 'Ana',
  dataLabel: 'segunda-feira, 10 de outubro',
  horarioLabel: '09:30',
  metricas: { consultas: 8, fila: 2, finalizadas: 3, receita: 'R$ 1.250,00' },
  agenda: [
    { id: 'ag-1', horario: '10:00', paciente: 'Mariana Costa', tipo: 'Consulta', status: 'Confirmado' },
    { id: 'ag-2', horario: '11:30', paciente: 'Rafael Lima', tipo: 'Retorno', status: 'Agendado' },
  ],
  filaAgora: [
    { id: 'f-1', paciente: 'Joana Albuquerque', medico: 'Dra. Camila Rocha', prioridade: 'urgente', status: 'aguardando', espera: '22 min' },
  ],
  alertas: [
    { id: 'estoque', titulo: 'Estoque baixo', detalhe: '1 item precisa de reposição', href: '/estoque', tom: 'info' as const },
  ],
  desempenho: { percentual: 38, descricao: '3 de 8 consultas finalizadas' },
  fluxoFinanceiro: [{ name: 'out', receitas: 1250, despesas: 420 }],
  acoes: [
    { label: 'Agendar consulta', href: '/agenda', icon: 'calendar' as const },
    { label: 'Novo paciente', href: '/pacientes', icon: 'patient' as const },
  ],
};

function renderPainel(overrides: Partial<Parameters<typeof InicioPainel>[0]> = {}) {
  return render(
    <MemoryRouter>
      <InicioPainel {...props} {...overrides} />
    </MemoryRouter>,
  );
}
