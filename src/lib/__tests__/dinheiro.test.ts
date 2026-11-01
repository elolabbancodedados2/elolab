import { describe, it, expect } from 'vitest';
import { emCentavos, mesmoValor, diferencaEmReais, arredondarReais, parseValorContado } from '@/lib/dinheiro';

describe('parseValorContado', () => {
  it('requires a value and accepts an explicitly counted zero', () => {
    expect(parseValorContado('')).toBeNull();
    expect(parseValorContado('   ')).toBeNull();
    expect(parseValorContado('0')).toBe(0);
  });

  it('rejects invalid, infinite and negative values', () => {
    expect(parseValorContado('abc')).toBeNull();
    expect(parseValorContado('Infinity')).toBeNull();
    expect(parseValorContado('-0.01')).toBeNull();
  });

  it('rounds valid amounts to cents', () => {
    expect(parseValorContado('10.005')).toBe(10.01);
  });
});

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

describe('parseMoneyInput', () => {
  it('aceita formato brasileiro e decimal', async () => {
    const { parseMoneyInput } = await import('@/lib/dinheiro');
    expect(parseMoneyInput('1.234,56')).toBe(1234.56);
    expect(parseMoneyInput('1234,5')).toBe(1234.5);
    expect(parseMoneyInput('99.90')).toBe(99.9);
    expect(parseMoneyInput(' 10 ')).toBe(10);
  });

  it('recusa vazio, letras, negativos e mais de duas casas', async () => {
    const { parseMoneyInput } = await import('@/lib/dinheiro');
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('-5')).toBeNull();
    expect(parseMoneyInput('1,234')).toBeNull();
  });
});

describe('valorPorExtenso', () => {
  it('escreve reais e centavos', async () => {
    const { valorPorExtenso } = await import('@/lib/dinheiro');
    expect(valorPorExtenso(1)).toBe('um real');
    expect(valorPorExtenso(0.5)).toBe('cinquenta centavos');
    expect(valorPorExtenso(100)).toBe('cem reais');
    expect(valorPorExtenso(150.75)).toBe('cento e cinquenta reais e setenta e cinco centavos');
    expect(valorPorExtenso(1234.56)).toBe('mil duzentos e trinta e quatro reais e cinquenta e seis centavos');
    expect(valorPorExtenso(1100)).toBe('mil e cem reais');
    expect(valorPorExtenso(2000000)).toBe('dois milhões de reais');
  });
});

describe('calcularDesconto e calcularTroco', () => {
  it('converte percentual em reais e recusa mais de 100%', async () => {
    const { calcularDesconto } = await import('@/lib/dinheiro');
    expect(calcularDesconto(200, '10', 'percentual')).toBe(20);
    expect(calcularDesconto(99.9, '15', 'percentual')).toBe(14.99);
    expect(calcularDesconto(200, '15,50', 'reais')).toBe(15.5);
    expect(calcularDesconto(200, '120', 'percentual')).toBeNull();
    expect(calcularDesconto(200, 'x', 'reais')).toBeNull();
  });

  it('calcula o troco em centavos', async () => {
    const { calcularTroco } = await import('@/lib/dinheiro');
    expect(calcularTroco(180.3, 200)).toBe(19.7);
    expect(calcularTroco(200, 200)).toBe(0);
    expect(calcularTroco(200, 150)).toBeNull();
  });
});
