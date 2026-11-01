import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { bloqueiosDoDia, contaNaAgenda, rotuloBloqueio } from './resumoDiaAgenda';
import { WeeklyView } from './WeeklyView';
import { MonthlyView } from './MonthlyView';

const agendamentos = [
  { id: 'a1', data: '2026-11-02', hora_inicio: '08:00:00', status: 'agendado', medico_id: 'm1', pacientes: { nome: 'Ana' } },
  { id: 'a2', data: '2026-11-02', hora_inicio: '09:00:00', status: 'cancelado', medico_id: 'm1', pacientes: { nome: 'Bia' } },
  { id: 'a3', data: '2026-11-02', hora_inicio: '10:00:00', status: 'faltou', medico_id: 'm1', pacientes: { nome: 'Caio' } },
];
const bloqueios = [
  { id: 'b1', medico_id: 'm1', data_inicio: '2026-11-03', data_fim: '2026-11-04', motivo: 'Férias' },
  { id: 'b2', medico_id: 'm2', data_inicio: '2026-11-03', data_fim: '2026-11-03', motivo: 'Congresso' },
];

describe('resumo do dia da agenda', () => {
  it('não conta cancelados nem faltas', () => {
    expect(agendamentos.filter(contaNaAgenda).map(a => a.id)).toEqual(['a1']);
  });

  it('filtra bloqueios pelo dia e pelos médicos visíveis', () => {
    expect(bloqueiosDoDia(bloqueios, '2026-11-03').map(b => b.id)).toEqual(['b1', 'b2']);
    expect(bloqueiosDoDia(bloqueios, '2026-11-04', ['m1']).map(b => b.id)).toEqual(['b1']);
    expect(bloqueiosDoDia(bloqueios, '2026-11-03', ['m2']).map(b => b.id)).toEqual(['b2']);
  });

  it('monta o rótulo com motivo, médico e horário', () => {
    expect(rotuloBloqueio({ ...bloqueios[0], hora_inicio: '08:00:00', hora_fim: '12:00:00' }, { m1: { nome: 'Júlia' } }))
      .toBe('Bloqueado: Férias · Dr(a). Júlia (08:00–12:00)');
    expect(rotuloBloqueio(bloqueios[0], { m1: { nome: 'Júlia' } }, false)).toBe('Bloqueado: Férias');
  });
});

describe('visões semanal e mensal', () => {
  it('mostra contagem sem cancelados e o bloqueio do dia na semana', () => {
    render(<WeeklyView date="2026-11-02" agendamentos={agendamentos} colorFor={() => '#000'} onDayClick={vi.fn()} onCardClick={vi.fn()} bloqueios={bloqueios} medicosVisiveis={['m1']} />);
    const lista = screen.getByRole('region', { name: 'Agenda semanal em lista' });
    expect(within(lista).getByText('1 consulta')).toBeInTheDocument();
    expect(within(lista).getAllByText('Bloqueado: Férias')).toHaveLength(2);
    expect(within(lista).queryByText(/Congresso/)).not.toBeInTheDocument();
  });

  it('lista no celular só os dias do mês com consulta ou bloqueio', () => {
    render(<MonthlyView date="2026-11-15" agendamentos={agendamentos} colorFor={() => '#000'} onDayClick={vi.fn()} bloqueios={bloqueios} medicosVisiveis={['m1']} />);
    const lista = screen.getByRole('region', { name: 'Agenda mensal em lista' });
    expect(within(lista).getAllByRole('button')).toHaveLength(3);
    expect(within(lista).getByText('1 consulta')).toBeInTheDocument();
  });
});
