import { describe, expect, it } from 'vitest';
import { lerDadosDaGuia } from '../guiaExamesGravada';

describe('leitura da guia gravada na descrição do exame', () => {
  it('recupera indicação, hipótese, urgência, jejum e validade', () => {
    const descricao = [
      'Indicação Clínica: Dor torácica',
      'Hipótese Diagnóstica: I20.9',
      'Urgência: URGENTE',
      'Justificativa: Dor há 2 horas',
      'Jejum: 8h',
      'Validade: até 30/11/2026',
      'Anexos: 1 arquivo',
    ].join('\n');
    expect(lerDadosDaGuia(descricao)).toEqual({
      indicacaoClinica: 'Dor torácica',
      hipoteseDiagnostica: 'I20.9',
      urgencia: 'Urgente',
      justificativaUrgencia: 'Dor há 2 horas',
      jejum: '8h',
      validade: '2026-11-30',
    });
  });

  it('assume urgência normal e campos vazios quando não há descrição', () => {
    expect(lerDadosDaGuia(null)).toEqual({ urgencia: 'Normal', indicacaoClinica: undefined, hipoteseDiagnostica: undefined, justificativaUrgencia: undefined, jejum: undefined, validade: undefined });
    expect(lerDadosDaGuia('Urgência: EMERGENCIA').urgencia).toBe('Emergência');
  });
});
