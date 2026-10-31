import { describe, expect, it } from 'vitest';
import {
  agregarPorConta,
  arvoreDeContas,
  compararCodigo,
  dreParaCsv,
  margemSobreReceitaLiquida,
  montarDre,
  montarEventosRealizados,
  variacaoPercentual,
  type ContaPlano,
  type EventoRealizado,
  type VinculoCategoria,
} from './dre';

const conta = (id: string, codigo: string, natureza: ContaPlano['natureza'], grupo: ContaPlano['grupo_dre'], pai: string | null = null): ContaPlano => ({
  id, codigo, nome: `Conta ${codigo}`, natureza, grupo_dre: grupo, pai_id: pai, ativo: true,
});

const contas: ContaPlano[] = [
  conta('rb', '1.1', 'receita', 'receita_bruta'),
  conta('ded', '2', 'despesa', 'deducoes'),
  conta('cus', '3.1', 'despesa', 'custos_servicos'),
  conta('pes', '4.1', 'despesa', 'despesas_pessoal'),
  conta('alu', '4.3', 'despesa', 'despesas_ocupacao'),
  conta('rfin', '5', 'receita', 'resultado_financeiro'),
  conta('dfin', '6', 'despesa', 'resultado_financeiro'),
];

const vinculos: VinculoCategoria[] = [
  { natureza: 'receita', categoria: 'consulta', conta_id: 'rb' },
  { natureza: 'despesa', categoria: 'impostos', conta_id: 'ded' },
  { natureza: 'despesa', categoria: 'repasse', conta_id: 'cus' },
  { natureza: 'despesa', categoria: 'folha_pagamento', conta_id: 'pes' },
  { natureza: 'despesa', categoria: 'aluguel', conta_id: 'alu' },
  { natureza: 'receita', categoria: 'rendimento', conta_id: 'rfin' },
  { natureza: 'despesa', categoria: 'tarifa', conta_id: 'dfin' },
];

let seq = 0;
const ev = (tipo: string, categoria: string, valor: number, lancamentoId = `l${++seq}`): EventoRealizado => ({
  id: `e${++seq}`, lancamentoId, tipo, categoria, data: '2026-10-10', valor,
});

describe('agregarPorConta', () => {
  it('soma por conta e separa categorias sem conta, contando lançamentos distintos', () => {
    const r = agregarPorConta([
      ev('receita', 'consulta', 100),
      ev('receita', 'consulta', 50),
      ev('despesa', 'material', 30, 'lx'),
      ev('despesa', 'material', 20, 'lx'),
      ev('receita', 'exame', 80, 'ly'),
    ], contas, vinculos);

    expect(r.porConta.get('rb')).toBe(150);
    expect(r.lancamentosSemConta).toBe(2);
    expect(r.semConta).toEqual([
      { natureza: 'receita', categoria: 'exame', valor: 80, lancamentos: 1 },
      { natureza: 'despesa', categoria: 'material', valor: 50, lancamentos: 1 },
    ]);
    expect(r.valorSemConta).toBe(30);
  });

  it('a mesma categoria em naturezas diferentes não se mistura', () => {
    const r = agregarPorConta([ev('despesa', 'consulta', 40)], contas, vinculos);
    expect(r.porConta.size).toBe(0);
    expect(r.semConta[0]).toMatchObject({ natureza: 'despesa', categoria: 'consulta' });
  });

  it('ignora vínculo com conta de natureza diferente', () => {
    const r = agregarPorConta([ev('despesa', 'x', 10)], contas, [{ natureza: 'despesa', categoria: 'x', conta_id: 'rb' }]);
    expect(r.porConta.size).toBe(0);
    expect(r.lancamentosSemConta).toBe(1);
  });
});

describe('variação e margem', () => {
  it('variação sobre o valor absoluto anterior e nula sem base', () => {
    expect(variacaoPercentual(120, 100)).toBeCloseTo(20);
    expect(variacaoPercentual(-50, -100)).toBeCloseTo(50);
    expect(variacaoPercentual(10, 0)).toBeNull();
  });

  it('margem só existe com receita líquida positiva', () => {
    expect(margemSobreReceitaLiquida(25, 100)).toBe(25);
    expect(margemSobreReceitaLiquida(25, 0)).toBeNull();
    expect(margemSobreReceitaLiquida(25, -10)).toBeNull();
  });
});

describe('montarDre', () => {
  const dre = montarDre({
    contas,
    vinculos,
    eventosMes: [
      ev('receita', 'consulta', 1000),
      ev('despesa', 'impostos', 100),
      ev('despesa', 'repasse', 300),
      ev('despesa', 'folha_pagamento', 200),
      ev('despesa', 'aluguel', 100),
      ev('receita', 'rendimento', 20),
      ev('despesa', 'tarifa', 10),
      ev('despesa', 'sem_mapa', 999),
    ],
    eventosMesAnterior: [
      ev('receita', 'consulta', 800),
      ev('despesa', 'repasse', 300),
    ],
  });
  const linha = (id: string) => dre.linhas.find(l => l.id === id)!;

  it('monta a cascata com os subtotais na ordem certa', () => {
    expect(dre.linhas.map(l => l.id)).toEqual([
      'receita_bruta', 'deducoes', 'receita_liquida', 'custos_servicos', 'lucro_bruto',
      'despesas_pessoal', 'despesas_administrativas', 'despesas_ocupacao', 'despesas_marketing',
      'resultado_operacional', 'resultado_financeiro', 'outras', 'resultado_liquido',
    ]);
    expect(linha('receita_bruta').valor).toBe(1000);
    expect(linha('deducoes').valor).toBe(-100);
    expect(linha('receita_liquida').valor).toBe(900);
    expect(linha('lucro_bruto').valor).toBe(600);
    expect(linha('resultado_operacional').valor).toBe(300);
    expect(linha('resultado_financeiro').valor).toBe(10);
    expect(linha('resultado_liquido').valor).toBe(310);
    expect(dre.resultadoLiquido).toBe(310);
  });

  it('o que não tem conta fica fora do resultado e vai para o aviso', () => {
    expect(dre.lancamentosSemConta).toBe(1);
    expect(dre.semConta[0]).toMatchObject({ categoria: 'sem_mapa', valor: 999 });
  });

  it('compara com o mês anterior e calcula a margem sobre a receita líquida', () => {
    expect(linha('receita_bruta').anterior).toBe(800);
    expect(linha('receita_bruta').variacao).toBeCloseTo(25);
    expect(linha('resultado_liquido').anterior).toBe(500);
    expect(linha('resultado_liquido').variacao).toBeCloseTo(-38);
    expect(linha('lucro_bruto').margem).toBeCloseTo(66.67, 1);
    expect(linha('despesas_marketing').variacao).toBeNull();
  });

  it('expande cada grupo nas contas com movimento, com sinal no resultado', () => {
    expect(linha('resultado_financeiro').contas.map(c => [c.codigo, c.valor])).toEqual([['5', 20], ['6', -10]]);
    expect(linha('despesas_marketing').contas).toEqual([]);
  });

  it('exporta CSV com números sem prefixo de proteção e rótulos protegidos', () => {
    const csv = dreParaCsv(dre, '2026-10', '2026-09');
    const linhas = csv.split('\r\n');
    expect(linhas[0]).toContain('"Valor 2026-10"');
    expect(csv).toContain('"(−) Deduções";"";"-100,00";"0,00";"";"-11,11"');
    expect(csv).toContain(`"'= Resultado líquido";"";"310,00";"500,00"`);
    expect(linhas.at(-1)).toContain('"1 lançamentos"');
  });
});

describe('montarEventosRealizados', () => {
  it('usa pagamentos individuais com estorno e cai no lançamento legado sem pagamento', () => {
    const eventos = montarEventosRealizados(
      [
        { id: 'p1', lancamento_id: 'l1', valor: 100, data_pagamento: '2026-10-05T15:00:00Z', estornado_em: '2026-10-20T15:00:00Z', lancamentos: { tipo: 'receita', categoria: 'consulta' } },
        { id: 'p2', lancamento_id: 'l2', valor: 50, data_pagamento: '2026-09-30T12:00:00Z', estornado_em: null, lancamentos: [{ tipo: 'despesa', categoria: null }] },
      ],
      [
        { id: 'l1', tipo: 'receita', categoria: 'consulta', status: 'pago', valor: 100, valor_pago: 100, data: '2026-10-05', data_pagamento: '2026-10-05' },
        { id: 'l3', tipo: 'receita', categoria: 'exame', status: 'pago', valor: 200, valor_pago: 180, data: '2026-10-01', data_pagamento: '2026-10-02' },
        { id: 'l4', tipo: 'receita', categoria: 'exame', status: 'pendente', valor: 200, valor_pago: null, data: '2026-10-01', data_pagamento: null },
      ],
      '2026-10-01',
      '2026-11-01',
    );
    expect(eventos.map(e => [e.id, e.valor, e.data])).toEqual([
      ['l3', 180, '2026-10-02'],
      ['p1', 100, '2026-10-05'],
      ['p1:estorno', -100, '2026-10-20'],
    ]);
  });
});

describe('árvore do plano', () => {
  it('ordena códigos por segmento numérico', () => {
    expect(['1.10', '2', '1.2', '1'].sort(compararCodigo)).toEqual(['1', '1.2', '1.10', '2']);
  });

  it('coloca filhos depois do pai com nível', () => {
    const arvore = arvoreDeContas([
      conta('f', '1.1', 'receita', 'receita_bruta', 'p'),
      conta('o', '9', 'despesa', 'outras', 'inexistente'),
      conta('p', '1', 'receita', 'receita_bruta'),
    ]);
    expect(arvore.map(n => [n.conta.codigo, n.nivel])).toEqual([['1', 0], ['1.1', 1], ['9', 0]]);
  });
});
