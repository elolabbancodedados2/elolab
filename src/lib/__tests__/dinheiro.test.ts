import { describe, it, expect } from 'vitest';
import { emCentavos, mesmoValor, diferencaEmReais, arredondarReais } from '@/lib/dinheiro';

/**
 * O fechamento de caixa comparava `parseFloat(valorContado) === totais.final`.
 * `totais.final` sai de somas sucessivas de valores em reais e carrega resíduo
 * de ponto flutuante. A operadora contava o caixa certinho, digitava o valor
 * certo, e o painel ficava vermelho mostrando "Diferença: R$ 0,00".
 */
/** Três lançamentos que somam 60,60 — mas em float dão 60.599999999999994. */
const SOMA_COM_RESIDUO = 10.1 + 20.2 + 30.3;

describe('mesmoValor', () => {
  it('reconhece igualdade apesar do resíduo de float', () => {
    expect(SOMA_COM_RESIDUO === 60.6).toBe(false); // o bug, documentado
    expect(mesmoValor(60.6, SOMA_COM_RESIDUO)).toBe(true); // a correção
  });

  it('o caso clássico do 0.1 + 0.2', () => {
    expect(0.1 + 0.2 === 0.3).toBe(false);
    expect(mesmoValor(0.1 + 0.2, 0.3)).toBe(true);
  });

  it('ainda acusa divergência de verdade, mesmo de um centavo', () => {
    expect(mesmoValor(60.6, 60.61)).toBe(false);
    expect(mesmoValor(1000, 999.99)).toBe(false);
  });

  it('trata zero e negativo', () => {
    expect(mesmoValor(0, 0)).toBe(true);
    expect(mesmoValor(-50.3, -50.3)).toBe(true);
    expect(mesmoValor(-50.3, 50.3)).toBe(false);
  });
});

describe('diferencaEmReais', () => {
  it('devolve zero exato quando as quantias batem', () => {
    // A subtração direta daria 5.68e-15, exibido como "R$ 0,00" num painel vermelho
    expect(diferencaEmReais(60.6, SOMA_COM_RESIDUO)).toBe(0);
  });

  it('mostra sobra de caixa como positivo', () => {
    expect(diferencaEmReais(100, 60.6)).toBeCloseTo(39.4, 10);
  });

  it('mostra falta de caixa como negativo', () => {
    expect(diferencaEmReais(55, 60.6)).toBeCloseTo(-5.6, 10);
  });

  it('não arrasta resíduo para a diferença', () => {
    expect(diferencaEmReais(0.3, 0.1 + 0.2)).toBe(0);
  });
});

describe('emCentavos', () => {
  it('converte reais em centavos inteiros', () => {
    expect(emCentavos(60.6)).toBe(6060);
    expect(emCentavos(0.1 + 0.2)).toBe(30);
  });

  it('trata entrada inválida como zero em vez de NaN', () => {
    expect(emCentavos(NaN)).toBe(0);
    expect(emCentavos(undefined as unknown as number)).toBe(0);
  });
});

describe('arredondarReais', () => {
  it('corta o resíduo antes de gravar no banco', () => {
    expect(arredondarReais(SOMA_COM_RESIDUO)).toBe(60.6);
    expect(arredondarReais(0.1 + 0.2)).toBe(0.3);
  });

  it('arredonda meio centavo para cima', () => {
    expect(arredondarReais(10.005)).toBe(10.01);
  });
});
