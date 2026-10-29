import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { alteracoesDaVersao, trilhaDeVersoes } from '../laudoWorkflow';

const v1 = { resultado: '5', unidade: 'mg/dL', valor_referencia_min: 1, valor_referencia_max: 4, metodo: 'A', critico: false, liberado: true, validado_por: 'u1' };

describe('trilha completa da retificação de resultado', () => {
  it('descreve cada campo clínico alterado com valor anterior e novo', () => {
    expect(alteracoesDaVersao(v1, { ...v1, resultado: '7', valor_referencia_max: 6, metodo: 'B', critico: true })).toEqual([
      'Resultado: 5 mg/dL → 7 mg/dL',
      'Referência: 1 a 4 mg/dL → 1 a 6 mg/dL',
      'Método: A → B',
      'Crítico: não → sim',
    ]);
  });

  it('identifica eventos de conferência e liberação sem mudança de valor', () => {
    const anterior = { ...v1, liberado: false, validado_por: null };
    expect(alteracoesDaVersao(anterior, { ...anterior, validado_por: 'u2' })).toEqual(['Conferência técnica registrada']);
    expect(alteracoesDaVersao(anterior, { ...anterior, liberado: true })).toEqual(['Liberado: não → sim']);
  });

  it('compara cada versão com a seguinte e a última com o registro atual', () => {
    const atual = { ...v1, resultado: '9' };
    const trilha = trilhaDeVersoes(
      [
        { numero_versao: 2, registro_anterior: { ...v1, resultado: '7' } },
        { numero_versao: 1, registro_anterior: v1 },
      ],
      atual,
    );
    expect(trilha.map(item => [item.numero_versao, item.alteracoes])).toEqual([
      [2, ['Resultado: 7 mg/dL → 9 mg/dL']],
      [1, ['Resultado: 5 mg/dL → 7 mg/dL']],
    ]);
  });

  it('o histórico mostra autor e alterações na tela de laudos', () => {
    const tela = readFileSync('src/pages/laboratorio/LaudoPage.tsx', 'utf8');
    expect(tela).toMatch(/autor:profiles!resultados_laboratorio_versoes_alterado_por_fkey\(nome\)/);
    expect(tela).toMatch(/trilhaDeVersoes\(historicoResultado, res\)/);
  });
});
