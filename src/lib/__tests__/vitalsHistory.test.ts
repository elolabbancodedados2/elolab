import { describe, expect, it } from 'vitest';
import { consolidarHistoricoVitais, historicoVitaisLimitado, type ProntuarioVitalsRow, type TriagemVitalsRow } from '@/lib/vitalsHistory';

describe('histórico longitudinal de sinais vitais', () => {
  it('inclui medições do prontuário e combina-as com a triagem do mesmo atendimento', () => {
    const triagens: TriagemVitalsRow[] = [{
      id: 'triagem-1', paciente_id: 'paciente-1', agendamento_id: 'consulta-1',
      pressao_arterial: '120/80', frequencia_cardiaca: 72, frequencia_respiratoria: null,
      temperatura: null, peso: 70, altura: 1.7, imc: 24.2, saturacao: 98, glicemia: null,
      dor_escala: null, data_hora: null, created_at: '2026-10-10T12:00:00Z',
    }];
    const prontuarios: ProntuarioVitalsRow[] = [{
      id: 'prontuario-1', paciente_id: 'paciente-1', agendamento_id: 'consulta-1', data: '2026-10-10',
      created_at: '2026-10-10T12:15:00Z', sinais_vitais: {
        frequencia_cardiaca: '75', glicemia: '105', temperatura: '36,7',
      },
    }];

    const registros = consolidarHistoricoVitais(triagens, prontuarios);

    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      paciente_id: 'paciente-1', created_at: '2026-10-10T12:00:00Z',
      pressao_sistolica: 120, pressao_diastolica: 80, frequencia_cardiaca: 75,
      peso: 70, oxigenacao: 98, glicemia: 105, temperatura: 36.7,
    });
  });

  it('preserva várias evoluções do mesmo atendimento e combina a triagem apenas com a mais recente', () => {
    const triagens: TriagemVitalsRow[] = [{
      id: 'triagem-1', paciente_id: 'paciente-1', agendamento_id: 'consulta-1',
      pressao_arterial: '120/80', frequencia_cardiaca: 72, frequencia_respiratoria: null,
      temperatura: null, peso: null, altura: null, imc: null, saturacao: null, glicemia: null,
      dor_escala: null, data_hora: '2026-10-10T09:00:00Z', created_at: '2026-10-10T09:00:00Z',
    }];
    const prontuarios: ProntuarioVitalsRow[] = [
      {
        id: 'evolucao-recente', paciente_id: 'paciente-1', agendamento_id: 'consulta-1', data: '2026-10-10',
        created_at: '2026-10-10T11:00:00Z', sinais_vitais: { frequencia_cardiaca: 88, temperatura: 37.1 },
      },
      {
        id: 'evolucao-anterior', paciente_id: 'paciente-1', agendamento_id: 'consulta-1', data: '2026-10-10',
        created_at: '2026-10-10T10:00:00Z', sinais_vitais: { frequencia_cardiaca: 76, peso: 70 },
      },
    ];

    const registros = consolidarHistoricoVitais(triagens, prontuarios);

    expect(registros).toHaveLength(2);
    expect(registros.find(({ id }) => id === 'evolucao-recente')).toMatchObject({
      frequencia_cardiaca: 88, temperatura: 37.1, pressao_sistolica: 120, pressao_diastolica: 80,
    });
    expect(registros.find(({ id }) => id === 'evolucao-anterior')).toMatchObject({
      frequencia_cardiaca: 76, peso: 70,
    });
  });

  it('ordena pela data usada na exibição e usa created_at quando data_hora está ausente', () => {
    const triagens: TriagemVitalsRow[] = [
      { id: 'mais-nova', paciente_id: 'p1', agendamento_id: null, pressao_arterial: null, frequencia_cardiaca: null, frequencia_respiratoria: null, temperatura: null, peso: null, altura: null, imc: null, saturacao: null, glicemia: null, dor_escala: null, data_hora: '2026-10-12T10:00:00Z', created_at: '2026-10-12T10:00:00Z' },
      { id: 'fallback', paciente_id: 'p1', agendamento_id: null, pressao_arterial: null, frequencia_cardiaca: null, frequencia_respiratoria: null, temperatura: null, peso: null, altura: null, imc: null, saturacao: null, glicemia: null, dor_escala: null, data_hora: null, created_at: '2026-10-11T10:00:00Z' },
      { id: 'mais-antiga', paciente_id: 'p1', agendamento_id: null, pressao_arterial: null, frequencia_cardiaca: null, frequencia_respiratoria: null, temperatura: null, peso: null, altura: null, imc: null, saturacao: null, glicemia: null, dor_escala: null, data_hora: '2026-10-09T10:00:00Z', created_at: '2026-10-09T10:00:00Z' },
    ];

    expect(consolidarHistoricoVitais(triagens, []).map(({ id }) => id))
      .toEqual(['mais-antiga', 'fallback', 'mais-nova']);
  });

  it('mantém separadas medições sem vínculo com o mesmo atendimento', () => {
    const triagens: TriagemVitalsRow[] = [{
      id: 'triagem-1', paciente_id: 'p1', agendamento_id: null, pressao_arterial: null,
      frequencia_cardiaca: null, frequencia_respiratoria: null, temperatura: null, peso: null,
      altura: null, imc: null, saturacao: null, glicemia: null, dor_escala: null,
      data_hora: '2026-10-10T12:00:00Z', created_at: '2026-10-10T12:00:00Z',
    }];
    const prontuarios: ProntuarioVitalsRow[] = [{
      id: 'prontuario-1', paciente_id: 'p1', agendamento_id: null, data: '2026-10-10',
      created_at: '2026-10-10T12:15:00Z', sinais_vitais: { peso: '70' },
    }];

    expect(consolidarHistoricoVitais(triagens, prontuarios)).toHaveLength(2);
  });

  it('ignora prontuários sem sinais vitais para não criar medições vazias', () => {
    const prontuarios: ProntuarioVitalsRow[] = [{
      id: 'prontuario-sem-vitais', paciente_id: 'p1', agendamento_id: null, data: '2026-10-10',
      created_at: '2026-10-10T12:15:00Z', sinais_vitais: {},
    }];

    expect(consolidarHistoricoVitais([], prontuarios)).toEqual([]);
  });

  it('usa a data clínica do prontuário quando a medição não tem triagem vinculada', () => {
    const prontuarios: ProntuarioVitalsRow[] = [{
      id: 'prontuario-1', paciente_id: 'p1', agendamento_id: null, data: '2026-10-09',
      created_at: '2026-10-11T14:15:00Z', sinais_vitais: { peso: '70' },
    }];

    expect(consolidarHistoricoVitais([], prontuarios)[0].created_at)
      .toBe('2026-10-09T12:00:00-03:00');
  });

  it('não avisa que o histórico foi limitado quando as fontes duplicadas viram menos de mil atendimentos', () => {
    expect(historicoVitaisLimitado(600, 600, 600, 1000)).toBe(false);
  });

  it('avisa quando a linha do tempo consolidada ultrapassa o limite', () => {
    expect(historicoVitaisLimitado(600, 600, 1200, 1000)).toBe(true);
  });
});
