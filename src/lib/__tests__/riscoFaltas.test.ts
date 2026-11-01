import { describe, expect, it } from 'vitest';
import { classificarRiscoFalta, consultasAindaPorVir, correspondeFiltroRiscoFalta, formatarDataHoraRiscoFalta, formatarIndiceRisco } from '@/lib/riscoFaltas';

describe('classificação de risco de falta', () => {
  it.each([
    [0, 'baixo'], [0.39, 'baixo'], [0.4, 'medio'], [0.69, 'medio'], [0.7, 'alto'], [1, 'alto'],
  ] as const)('classifica %s como %s', (probabilidade, faixa) => {
    expect(classificarRiscoFalta(probabilidade)).toBe(faixa);
  });

  it('filtra pela faixa calculada e mantém todos quando o filtro está aberto', () => {
    expect(correspondeFiltroRiscoFalta(0.7, 'alto')).toBe(true);
    expect(correspondeFiltroRiscoFalta(0.7, 'medio')).toBe(false);
    expect(correspondeFiltroRiscoFalta(0.15, 'todos')).toBe(true);
  });

  it('apresenta o cálculo heurístico como índice de 0 a 100', () => {
    expect(formatarIndiceRisco(0.736)).toBe(74);
    expect(formatarIndiceRisco(1.5)).toBe(100);
    expect(formatarIndiceRisco(-0.2)).toBe(0);
  });

  it('formata o ultimo calculo no fuso de Sao Paulo', () => {
    expect(formatarDataHoraRiscoFalta('2026-10-11T02:30:00.000Z')).toBe('10/10/2026 às 23:30');
  });
});

describe('consultas ainda por vir', () => {
  // 31/10/2026 às 14:00 em São Paulo (UTC-3).
  const agora = new Date('2026-10-31T17:00:00Z');

  it('tira as consultas de hoje que já começaram e mantém as próximas', () => {
    const consultas = [
      { id: 'manha', data_agendamento: '2026-10-31', hora_inicio: '09:00:00' },
      { id: 'agora', data_agendamento: '2026-10-31', hora_inicio: '14:00' },
      { id: 'tarde', data_agendamento: '2026-10-31', hora_inicio: '16:30:00' },
      { id: 'amanha', data_agendamento: '2026-11-01', hora_inicio: '08:00:00' },
      { id: 'sem-hora', data_agendamento: '2026-10-31', hora_inicio: null },
    ];
    expect(consultasAindaPorVir(consultas, agora).map(c => c.id)).toEqual(['tarde', 'amanha', 'sem-hora']);
  });

  it('usa o horário de São Paulo, não o do navegador', () => {
    // 02:30 UTC de 01/11 ainda é 23:30 de 31/10 em São Paulo.
    const noite = new Date('2026-11-01T02:30:00Z');
    const consultas = [
      { id: 'hoje-23h45', data_agendamento: '2026-10-31', hora_inicio: '23:45' },
      { id: 'hoje-22h', data_agendamento: '2026-10-31', hora_inicio: '22:00' },
    ];
    expect(consultasAindaPorVir(consultas, noite).map(c => c.id)).toEqual(['hoje-23h45']);
  });
});
