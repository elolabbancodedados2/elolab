import { describe, expect, it } from 'vitest';
import { podeIniciarAgendamento, separarFilaAtivaPorData } from '@/lib/filaPorData';

describe('separa a fila por data do agendamento', () => {
  it('mantém na chamada de hoje só os atendimentos do dia e sinaliza pendências antigas', () => {
    const fila = [
      { id: 'hoje', agendamento_id: 'a1', status: 'aguardando', agendamentos: { data: '2026-10-01' } },
      { id: 'ontem', agendamento_id: 'a2', status: 'em_atendimento', agendamentos: { data: '2026-09-30' } },
      { id: 'sem-data', agendamento_id: 'a3', status: 'chamado', agendamentos: null },
      { id: 'encerrado', agendamento_id: 'a4', status: 'finalizado', agendamentos: { data: '2026-09-30' } },
    ];

    const resultado = separarFilaAtivaPorData(fila, '2026-10-01', new Map());

    expect(resultado.hoje.map(item => item.id)).toEqual(['hoje']);
    expect(resultado.outrosDias.map(item => item.id)).toEqual(['ontem', 'sem-data']);
  });

  it('usa as datas já carregadas quando a relação não veio no item da fila', () => {
    const fila = [{ id: 'hoje', agendamento_id: 'a1', status: 'aguardando' }];

    const resultado = separarFilaAtivaPorData(
      fila,
      '2026-10-01',
      new Map([['a1', '2026-10-01']]),
    );

    expect(resultado.hoje).toEqual(fila);
    expect(resultado.outrosDias).toEqual([]);
  });
});

describe('protege a fila de agendamentos encerrados', () => {
  it.each(['cancelado', 'faltou', 'finalizado', 'atendimento_finalizado', 'aguardando_pagamento_adicional'])(
    'não permite iniciar um agendamento com estado %s',
    status => expect(podeIniciarAgendamento(status)).toBe(false),
  );

  it('permite estados ativos e falha fechado quando o estado não foi carregado', () => {
    expect(podeIniciarAgendamento('aguardando')).toBe(true);
    expect(podeIniciarAgendamento(undefined)).toBe(false);
  });
});
