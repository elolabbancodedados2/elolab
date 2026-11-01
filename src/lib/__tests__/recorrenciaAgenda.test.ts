import { describe, expect, it } from 'vitest';
import { datasDaRecorrencia, MAX_OCORRENCIAS } from '@/lib/recorrenciaAgenda';

describe('datasDaRecorrencia', () => {
  it('não gera nada sem repetição', () => {
    expect(datasDaRecorrencia('2026-11-02', 'nao', 4)).toEqual([]);
  });

  it('gera as ocorrências seguintes à primeira', () => {
    expect(datasDaRecorrencia('2026-11-02', 'semanal', 3)).toEqual(['2026-11-09', '2026-11-16']);
    expect(datasDaRecorrencia('2026-12-21', 'quinzenal', 3)).toEqual(['2027-01-04', '2027-01-18']);
  });

  it('mensal mantém o dia e usa o último dia nos meses curtos', () => {
    expect(datasDaRecorrencia('2027-01-31', 'mensal', 4)).toEqual(['2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('limita o total de ocorrências', () => {
    expect(datasDaRecorrencia('2026-11-02', 'semanal', 99)).toHaveLength(MAX_OCORRENCIAS - 1);
  });
});
