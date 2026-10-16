import { describe, expect, it } from 'vitest';
import { calculateAttendanceRate } from '../analyticsKpis';

describe('taxa de comparecimento do Analytics', () => {
  it('alinha a base a finalizados e faltas, excluindo estados sem desfecho', () => {
    const result = calculateAttendanceRate([
      { status: 'finalizado' },
      { status: 'atendimento_finalizado' },
      { status: 'faltou' },
      { status: 'confirmado' },
      { status: 'em_atendimento' },
      { status: 'cancelado' },
      { status: 'aguardando_pagamento' },
    ]);

    expect(result).toEqual({ attended: 2, missed: 1, denominator: 3, rate: 67 });
  });

  it('não inventa taxa quando não há consulta com desfecho', () => {
    expect(calculateAttendanceRate([{ status: 'agendado' }, { status: 'cancelado' }])).toEqual({
      attended: 0, missed: 0, denominator: 0, rate: null,
    });
  });
});
