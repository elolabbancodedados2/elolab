import { describe, expect, it } from 'vitest';
import { proximaOcorrencia, projetarFluxoCaixa, type LancamentoProjecao } from '../projecaoFluxoCaixa';

const conta = (extra: Partial<LancamentoProjecao>): LancamentoProjecao => ({
  id: 'x', tipo: 'receita', status: 'pendente', valor: 100, valor_pago: 0, desconto: 0, acrescimo: 0,
  data: '2026-10-01', data_vencimento: '2026-10-30', recorrente: false, frequencia_recorrencia: null, recorrencia_origem_id: null, ...extra,
});
const hoje = '2026-10-24';

describe('próxima ocorrência da recorrência', () => {
  it('soma meses mantendo o dia e ajustando ao fim do mês, como o banco', () => {
    expect(proximaOcorrencia('2026-01-31', 'mensal')).toBe('2026-02-28');
    expect(proximaOcorrencia('2026-10-15', 'trimestral')).toBe('2027-01-15');
    expect(proximaOcorrencia('2026-10-30', 'semanal')).toBe('2026-11-06');
    expect(proximaOcorrencia('2026-10-30', 'quinzenal')).toBe('2026-11-13');
    expect(proximaOcorrencia('2026-10-30', 'desconhecida')).toBeNull();
  });
});

describe('projeção do fluxo de caixa', () => {
  const lancamentos = [
    conta({ id: 'r1', valor: 100, valor_pago: 40, data_vencimento: '2026-10-30' }),
    conta({ id: 'r2', valor: 50, data_vencimento: '2026-10-10' }), // vencida há 14 dias
    conta({ id: 'r3', valor: 70, data_vencimento: '2026-08-01' }), // vencida há mais de 30 dias
    conta({ id: 'd1', tipo: 'despesa', valor: 30, data_vencimento: '2026-09-01' }), // despesa vencida
    conta({ id: 'd2', tipo: 'despesa', valor: 200, data_vencimento: '2026-11-05', recorrente: true, frequencia_recorrencia: 'mensal' }),
    conta({ id: 'd3', tipo: 'despesa', valor: 999, status: 'cancelado', data_vencimento: '2026-11-05' }),
    conta({ id: 'r4', valor: 10, data_vencimento: '2027-05-01' }), // fora do horizonte
  ];

  it('cenário realista: vencidas até 30 dias entram no mês atual; recorrência é projetada', () => {
    const r = projetarFluxoCaixa(lancamentos, [], { hoje, meses: 3, cenario: 'realista' });
    expect(r.map(m => m.mes)).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(r[0]).toMatchObject({ previstoEntradas: 110, previstoSaidas: 30, recorrenteSaidas: 0 });
    expect(r[1]).toMatchObject({ previstoEntradas: 0, previstoSaidas: 200, recorrenteSaidas: 0 });
    expect(r[2]).toMatchObject({ previstoSaidas: 200, recorrenteSaidas: 200 });
  });

  it('cenários otimista e conservador mudam apenas as receitas vencidas', () => {
    expect(projetarFluxoCaixa(lancamentos, [], { hoje, meses: 1, cenario: 'otimista' })[0].previstoEntradas).toBe(180);
    expect(projetarFluxoCaixa(lancamentos, [], { hoje, meses: 1, cenario: 'conservador' })[0].previstoEntradas).toBe(60);
    expect(projetarFluxoCaixa(lancamentos, [], { hoje, meses: 1, cenario: 'conservador' })[0].previstoSaidas).toBe(30);
  });

  it('separa o realizado do previsto e acumula o saldo', () => {
    const r = projetarFluxoCaixa(lancamentos, [{ tipo: 'receita', valor: 500, data: '2026-10-02' }, { tipo: 'despesa', valor: 0.1, data: '2026-10-03' }, { tipo: 'receita', valor: 9, data: '2026-09-30' }], { hoje, meses: 2, cenario: 'realista' });
    expect(r[0]).toMatchObject({ realizadoEntradas: 500, realizadoSaidas: 0.1, saldoMes: 579.9, saldoAcumulado: 579.9 });
    expect(r[1]).toMatchObject({ realizadoEntradas: 0, saldoMes: -200, saldoAcumulado: 379.9 });
  });

  it('não soma sangria nem suprimento ao realizado, por serem transferências internas', () => {
    const semTransferencias = projetarFluxoCaixa(lancamentos, [{ tipo: 'receita', valor: 500, data: '2026-10-02' }], { hoje, meses: 1, cenario: 'realista' });
    const comTransferencias = projetarFluxoCaixa(lancamentos, [
      { tipo: 'receita', valor: 500, data: '2026-10-02' },
      { tipo: 'sangria', valor: 300, data: '2026-10-02' },
      { tipo: 'suprimento', valor: 50, data: '2026-10-03' },
    ], { hoje, meses: 1, cenario: 'realista' });
    expect(comTransferencias).toEqual(semTransferencias);
    expect(comTransferencias[0]).toMatchObject({ realizadoEntradas: 500, realizadoSaidas: 0 });
  });

  it('não projeta recorrência que já gerou a próxima conta', () => {
    const r = projetarFluxoCaixa([
      conta({ id: 'a', tipo: 'despesa', status: 'pago', valor: 80, data_vencimento: '2026-10-05', recorrente: true, frequencia_recorrencia: 'mensal' }),
      conta({ id: 'b', tipo: 'despesa', valor: 80, data_vencimento: '2026-11-05', recorrente: true, frequencia_recorrencia: 'mensal', recorrencia_origem_id: 'a' }),
    ], [], { hoje, meses: 2, cenario: 'realista' });
    expect(r[1]).toMatchObject({ previstoSaidas: 80, recorrenteSaidas: 0 });
  });
});
