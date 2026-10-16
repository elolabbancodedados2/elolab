import { describe, expect, it } from 'vitest';
import { compararConfiguracoes } from '../configHistory';

describe('compararConfiguracoes', () => {
  it('retorna somente campos diferentes com os dois valores', () => {
    expect(compararConfiguracoes(
      { nome: 'Clínica A', agenda: { duracao: 30 }, dias: ['seg', 'qua'] },
      { nome: 'Clínica B', agenda: { duracao: 45 }, dias: ['seg', 'qua', 'sex'] },
    )).toEqual([
      { campo: 'agenda.duracao', atual: 30, versao: 45 },
      { campo: 'dias', atual: ['seg', 'qua'], versao: ['seg', 'qua', 'sex'] },
      { campo: 'nome', atual: 'Clínica A', versao: 'Clínica B' },
    ]);
  });

  it('representa campos ausentes e trata snapshots iguais', () => {
    expect(compararConfiguracoes({ existente: true }, { novo: false })).toEqual([
      { campo: 'existente', atual: true, versao: undefined },
      { campo: 'novo', atual: undefined, versao: false },
    ]);
    expect(compararConfiguracoes({ a: 1 }, { a: 1 })).toEqual([]);
  });
});
