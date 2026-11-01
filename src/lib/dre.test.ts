import { describe, expect, it } from 'vitest';
import {
  agregarPorConta,
  arvoreDeContas,
  compararCodigo,
  dreAnualParaCsv,
  dreParaCsv,
  eventosDaConta,
  mesDeCompetencia,
  montarDreAnual,
  margemSobreReceitaLiquida,
  montarDre,
  montarEventosCompetencia,
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

describe('montarEventosCompetencia', () => {
  it('lança no mês de competência pelo valor líquido, pago ou não, sem cancelados', () => {
    const eventos = montarEventosCompetencia([
      { id: 'a', tipo: 'receita', categoria: 'consulta', status: 'pendente', valor: 200, desconto: 20, acrescimo: 5, data: '2026-11-03', data_pagamento: null, competencia: '2026-10' },
      { id: 'b', tipo: 'despesa', categoria: null, status: 'pago', valor: 50, data: '2026-10-15', data_pagamento: '2026-11-02', competencia: null },
      { id: 'c', tipo: 'receita', categoria: 'consulta', status: 'cancelado', valor: 999, data: '2026-10-10', data_pagamento: null },
      { id: 'd', tipo: 'sangria', categoria: 'sangria', status: 'pago', valor: 10, data: '2026-10-10', data_pagamento: null },
    ]);
    expect(eventos).toEqual([
      { id: 'a:competencia', lancamentoId: 'a', tipo: 'receita', categoria: 'consulta', data: '2026-10-01', valor: 185 },
      { id: 'b:competencia', lancamentoId: 'b', tipo: 'despesa', categoria: 'outros', data: '2026-10-01', valor: 50 },
    ]);
  });
});

describe('competência do lançamento', () => {
  it('usa competência, depois emissão, vencimento e data', () => {
    expect(mesDeCompetencia({ competencia: '2026-09', data_emissao: '2026-08-01', data_vencimento: '2026-10-10', data: '2026-11-01' })).toBe('2026-09');
    expect(mesDeCompetencia({ competencia: null, data_emissao: '2026-08-15', data_vencimento: '2026-10-10', data: '2026-11-01' })).toBe('2026-08');
    expect(mesDeCompetencia({ competencia: '', data_emissao: null, data_vencimento: '2026-10-10', data: '2026-11-01' })).toBe('2026-10');
    expect(mesDeCompetencia({ competencia: null, data_emissao: null, data_vencimento: null, data: '2026-11-01' })).toBe('2026-11');
  });

  it('lança pela data de emissão quando não há competência', () => {
    const [evento] = montarEventosCompetencia([
      { id: 'e', tipo: 'despesa', categoria: 'Aluguel', status: 'pendente', valor: 900, data: '2026-11-02', data_pagamento: null, competencia: null, data_emissao: '2026-10-28', data_vencimento: '2026-11-10' },
    ]);
    expect(evento).toMatchObject({ data: '2026-10-01', categoria: 'aluguel', valor: 900 });
  });
});

describe('DRE anual e detalhe da conta', () => {
  const eventos: EventoRealizado[] = [
    { id: '1', lancamentoId: 'a', tipo: 'receita', categoria: 'consulta', data: '2026-01-10', valor: 100 },
    { id: '2', lancamentoId: 'b', tipo: 'receita', categoria: 'consulta', data: '2026-03-05', valor: 250 },
    { id: '3', lancamentoId: 'c', tipo: 'despesa', categoria: 'aluguel', data: '2026-03-01', valor: 80 },
    { id: '4', lancamentoId: 'd', tipo: 'receita', categoria: 'consulta', data: '2025-12-31', valor: 999 },
  ];

  it('monta doze colunas e o total do ano', () => {
    const anual = montarDreAnual({ ano: 2026, contas, vinculos, eventos });
    expect(anual.meses).toHaveLength(12);
    const bruta = anual.linhas.find(l => l.id === 'receita_bruta')!;
    expect(bruta.valores.slice(0, 3)).toEqual([100, 0, 250]);
    expect(bruta.total).toBe(350);
    const liquido = anual.linhas.find(l => l.id === 'resultado_liquido')!;
    expect(liquido.valores[2]).toBe(170);
    expect(liquido.total).toBe(270);
    expect(dreAnualParaCsv(anual).split('\r\n')[0]).toContain('"Total 2026"');
  });

  it('lista os eventos que formam uma conta, com vínculo de categoria normalizado', () => {
    const vinculosMisturados: VinculoCategoria[] = [{ natureza: 'receita', categoria: 'Consulta', conta_id: 'rb' }];
    expect(eventosDaConta(eventos, 'rb', contas, vinculosMisturados).map(e => e.id)).toEqual(['4', '2', '1']);
    expect(eventosDaConta(eventos, 'inexistente', contas, vinculos)).toEqual([]);
    expect(agregarPorConta(eventos.slice(0, 2), contas, vinculosMisturados).porConta.get('rb')).toBe(350);
  });
});
