import { describe, expect, it } from 'vitest';
import { alteracoesGrade, chaveCelula, lerValorCelula, nomeDaCopia } from '@/lib/gradePrecosConsulta';

describe('gradePrecosConsulta', () => {
  it('lê valores com vírgula e recusa mais de duas casas', () => {
    expect(lerValorCelula('150,50')).toBe(150.5);
    expect(lerValorCelula('1.200,00')).toBe(1200);
    expect(lerValorCelula('')).toBeNull();
    expect(lerValorCelula('1,234')).toBeNaN();
  });

  it('separa inclusões, alterações e células inválidas', () => {
    const precos = [{ id: 'p1', tipo_consulta_id: 't1', convenio_id: 'c1', valor: 100 }, { id: 'p2', tipo_consulta_id: 't1', convenio_id: 'c2', valor: 80 }];
    const { alteracoes, invalidas } = alteracoesGrade({
      [chaveCelula('t1', 'c1')]: '100,00',
      [chaveCelula('t1', 'c2')]: '90',
      [chaveCelula('t2', 'c1')]: '50',
      [chaveCelula('t2', 'c2')]: '',
      [chaveCelula('t3', 'c1')]: 'abc',
    }, precos);
    expect(alteracoes).toEqual([
      { tipoId: 't1', convenioId: 'c2', valor: 90, existenteId: 'p2' },
      { tipoId: 't2', convenioId: 'c1', valor: 50, existenteId: null },
    ]);
    expect(invalidas).toEqual([chaveCelula('t3', 'c1')]);
  });

  it('não deixa apagar um preço já gravado pela grade', () => {
    const { invalidas } = alteracoesGrade({ [chaveCelula('t1', 'c1')]: '' }, [{ id: 'p1', tipo_consulta_id: 't1', convenio_id: 'c1', valor: 100 }]);
    expect(invalidas).toEqual([chaveCelula('t1', 'c1')]);
  });

  it('gera nome de cópia sem colidir', () => {
    expect(nomeDaCopia('Retorno', ['Retorno'])).toBe('Retorno (cópia)');
    expect(nomeDaCopia('Retorno', ['Retorno', 'retorno (cópia)'])).toBe('Retorno (cópia 2)');
  });
});
