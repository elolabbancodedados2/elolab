import { describe, expect, it } from 'vitest';
import { calcularRenegociacao, type ContaRenegociavel } from '../renegociacao';
import { seriesRecorrentes, type LancamentoRecorrente } from '../recorrencias';
import { montarRecibo, valorPorExtenso } from '../reciboPagamento';

const conta = (extra: Partial<ContaRenegociavel> = {}): ContaRenegociavel => ({
  id: 'c1', descricao: 'Tratamento', valor: 300, valor_pago: 0, desconto: 0, acrescimo: 0,
  data_vencimento: '2026-10-10', status: 'atrasado', observacoes: null, ...extra,
});
const proposta = { descricao: 'Tratamento', valor: 300, vencimento: '2026-11-20', desconto: 0, acrescimo: 15, motivo: 'Paciente pediu prazo' };
const contexto = { hoje: '2026-11-01', autor: 'Ana' };

describe('calcularRenegociacao', () => {
  it('muda o vencimento, aplica o acréscimo, devolve a vencida a pendente e registra o motivo', () => {
    const r = calcularRenegociacao(conta(), proposta, contexto);
    expect(r.ok).toBe(true);
    expect(r.novoSaldo).toBe(315);
    expect(r.alteracoes).toMatchObject({ data_vencimento: '2026-11-20', acrescimo: 15, status: 'pendente' });
    expect(r.alteracoes?.observacoes).toBe('Renegociada em 01/11/2026 por Ana (vencimento 10/10/2026 → 20/11/2026): Paciente pediu prazo');
  });

  it('com pagamento, não muda o valor original e mantém parcial', () => {
    const parcial = conta({ valor_pago: 100, status: 'atrasado', observacoes: 'Antes' });
    expect(calcularRenegociacao(parcial, { ...proposta, valor: 250 }, contexto)).toMatchObject({ ok: false });
    const r = calcularRenegociacao(parcial, { ...proposta, desconto: 50, acrescimo: 0 }, contexto);
    expect(r).toMatchObject({ ok: true, novoSaldo: 150 });
    expect(r.alteracoes).toMatchObject({ valor: 300, status: 'parcial' });
    expect(r.alteracoes?.observacoes.startsWith('Antes\n')).toBe(true);
  });

  it('recusa motivo curto, desconto maior que o valor e saldo zerado', () => {
    expect(calcularRenegociacao(conta(), { ...proposta, motivo: 'ok' }, contexto).erro).toContain('motivo');
    expect(calcularRenegociacao(conta(), { ...proposta, desconto: 301 }, contexto).erro).toContain('desconto');
    expect(calcularRenegociacao(conta(), { ...proposta, desconto: 315 }, contexto).erro).toContain('desconto');
    expect(calcularRenegociacao(conta(), { ...proposta, desconto: 300, acrescimo: 0 }, contexto).erro).toContain('maior que zero');
    expect(calcularRenegociacao(conta(), { ...proposta, vencimento: '2026-02-30' }, contexto).erro).toContain('vencimento');
  });
});

const lanc = (extra: Partial<LancamentoRecorrente>): LancamentoRecorrente => ({
  id: 'x', tipo: 'despesa', descricao: 'Aluguel', valor: 2000, categoria: 'aluguel', fornecedor: 'Imobiliária',
  status: 'pago', data_vencimento: '2026-09-10', frequencia_recorrencia: 'mensal', recorrencia_origem_id: null, recorrente: true, ...extra,
});

describe('seriesRecorrentes', () => {
  it('segue a cadeia até a ocorrência atual e conta as anteriores', () => {
    const series = seriesRecorrentes([
      lanc({ id: 'a' }),
      lanc({ id: 'b', recorrencia_origem_id: 'a', data_vencimento: '2026-10-10' }),
      lanc({ id: 'c', recorrencia_origem_id: 'b', data_vencimento: '2026-11-10', status: 'pendente' }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ ocorrencias: 3, proximoVencimento: '2026-11-10', emAberto: true, totalMensalEstimado: 2000 });
    expect(series[0].atual.id).toBe('c');
  });

  it('paga sem continuação prevê a próxima; encerrada e cancelada ficam de fora', () => {
    const series = seriesRecorrentes([
      lanc({ id: 'p', data_vencimento: '2026-01-31', frequencia_recorrencia: 'trimestral', valor: 300 }),
      lanc({ id: 'e', recorrente: false }),
      lanc({ id: 'k', status: 'cancelado' }),
    ]);
    expect(series.map(s => s.atual.id)).toEqual(['p']);
    expect(series[0]).toMatchObject({ proximoVencimento: '2026-04-30', emAberto: false, totalMensalEstimado: 100 });
  });
});

describe('recibo', () => {
  it('escreve valores por extenso', () => {
    expect(valorPorExtenso(1)).toBe('um real');
    expect(valorPorExtenso(0.5)).toBe('cinquenta centavos');
    expect(valorPorExtenso(1234.56)).toBe('mil duzentos e trinta e quatro reais e cinquenta e seis centavos');
    expect(valorPorExtenso(2001)).toBe('dois mil e um reais');
    expect(valorPorExtenso(1100)).toBe('mil e cem reais');
    expect(valorPorExtenso(1_000_000)).toBe('um milhão de reais');
    expect(valorPorExtenso(0)).toBe('zero real');
  });

  it('soma só os pagamentos informados e monta o texto', () => {
    const recibo = montarRecibo({
      clinica: { nome: 'Clínica Boa Saúde' },
      pagador: 'Maria Silva',
      descricao: 'Consulta de retorno',
      numero: 'AB12',
      pagamentos: [
        { id: '1', valor: 100.1, forma_pagamento: 'pix', data_pagamento: '2026-11-01T13:00:00Z' },
        { id: '2', valor: 50.2, forma_pagamento: 'credito', data_pagamento: '2026-11-01T14:30:00Z' },
      ],
    });
    expect(recibo.total).toBe(150.3);
    expect(recibo.corpo).toContain('Recebemos de Maria Silva a importância de');
    expect(recibo.corpo).toContain('cento e cinquenta reais e trinta centavos');
    expect(recibo.itens[1]).toContain('Cartão de crédito');
    expect(recibo.itens[0]).toContain('01/11/2026, 10:00');
  });
});
