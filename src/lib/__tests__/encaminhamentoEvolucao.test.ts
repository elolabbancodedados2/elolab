import { describe, expect, it } from 'vitest';
import { combinarEspecialidades, rascunhoDaEvolucao } from '@/lib/encaminhamentoEvolucao';

describe('combinarEspecialidades', () => {
  it('junta a lista padrão com as da clínica, sem repetir e com Outras no fim', () => {
    expect(combinarEspecialidades(['Cardiologia', 'Outras', 'Dermatologia'], ['cardiologia', 'Nefrologia', null, ' ']))
      .toEqual(['Cardiologia', 'Dermatologia', 'Nefrologia', 'Outras']);
  });
});

describe('rascunhoDaEvolucao', () => {
  it('monta motivo, hipótese e tratamento com o que existe', () => {
    expect(rascunhoDaEvolucao({
      queixa_principal: 'Dor torácica', historia_doenca_atual: '', diagnostico_principal: 'I20 - Angina',
      conduta: 'ECG', medicamentos_em_uso: 'AAS',
    })).toEqual({
      motivo: 'Queixa: Dor torácica',
      hipotese_diagnostica: 'I20 - Angina',
      cid_principal: 'I20 - Angina',
      tratamento_atual: 'Conduta: ECG\nMedicamentos em uso: AAS',
    });
    expect(rascunhoDaEvolucao({})).toEqual({});
  });
});
