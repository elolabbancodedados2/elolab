import { describe, expect, it } from 'vitest';
import { conciliarRecebimentosConvenio } from '../conciliacaoConvenio';

const lotes = [
  { id: 'l1', numero_lote: '10', convenio_nome: 'Unimed', valor_pago: 300 },
  { id: 'l2', numero_lote: '11', convenio_nome: 'Amil', valor_pago: 0.3 },
  { id: 'l3', numero_lote: '12', convenio_nome: 'Amil', valor_pago: 50 },
];

describe('conciliação de recebimentos de convênio por lote', () => {
  it('compara o retorno do lote com os lançamentos vinculados, descontando ajustes', () => {
    const r = conciliarRecebimentosConvenio(lotes, [
      { id: 'a', tipo: 'receita', categoria: 'convenio_repasse', valor: 350, valor_pago: 350, status: 'pago', lote_tiss_id: 'l1', descricao: 'TISS 10', data: '2026-10-01' },
      { id: 'b', tipo: 'despesa', categoria: 'ajuste_convenio', valor: 50, valor_pago: 50, status: 'pago', lote_tiss_id: 'l1', descricao: 'Correção', data: '2026-10-02' },
      { id: 'c', tipo: 'receita', categoria: 'convenio_repasse', valor: 0.1, valor_pago: 0.1, status: 'pago', lote_tiss_id: 'l2', descricao: 'TISS 11', data: '2026-10-01' },
      { id: 'd', tipo: 'receita', categoria: 'convenio_repasse', valor: 0.2, valor_pago: 0.2, status: 'pago', lote_tiss_id: 'l2', descricao: 'TISS 11', data: '2026-10-03' },
      { id: 'e', tipo: 'receita', categoria: 'convenio_repasse', valor: 80, valor_pago: null, status: 'cancelado', lote_tiss_id: 'l3', descricao: 'TISS 12', data: '2026-10-03' },
    ]);
    expect(r.lotes).toEqual([
      { id: 'l1', numero_lote: '10', convenio: 'Unimed', declarado: 300, lancado: 300, diferenca: 0, situacao: 'conciliado' },
      { id: 'l2', numero_lote: '11', convenio: 'Amil', declarado: 0.3, lancado: 0.3, diferenca: 0, situacao: 'conciliado' },
      { id: 'l3', numero_lote: '12', convenio: 'Amil', declarado: 50, lancado: 0, diferenca: 50, situacao: 'recebido_sem_lancamento' },
    ]);
  });

  it('sinaliza recebimentos de convênio sem lote e sugere lotes com a mesma diferença, sem criar nada', () => {
    const r = conciliarRecebimentosConvenio(lotes, [
      { id: 'x', tipo: 'receita', categoria: 'convenio_repasse', valor: 50, valor_pago: 50, status: 'pago', lote_tiss_id: null, descricao: 'Depósito Amil', data: '2026-10-05' },
      { id: 'y', tipo: 'receita', categoria: 'consulta', valor: 20, valor_pago: 20, status: 'pago', lote_tiss_id: null, forma_pagamento: 'convenio', descricao: 'Repasse avulso', data: '2026-10-06' },
      { id: 'z', tipo: 'receita', categoria: 'consulta', valor: 99, valor_pago: 99, status: 'pago', lote_tiss_id: null, forma_pagamento: 'pix', descricao: 'Particular', data: '2026-10-06' },
      { id: 'w', tipo: 'receita', categoria: 'convenio_repasse', valor: 30, valor_pago: null, status: 'pendente', lote_tiss_id: null, descricao: 'Previsto', data: '2026-10-06' },
    ]);
    expect(r.semCorrespondencia).toEqual([
      { id: 'x', descricao: 'Depósito Amil', data: '2026-10-05', valor: 50, sugestoes: ['l3'] },
      { id: 'y', descricao: 'Repasse avulso', data: '2026-10-06', valor: 20, sugestoes: [] },
    ]);
    expect(r.lotes.find(l => l.id === 'l1')?.situacao).toBe('recebido_sem_lancamento');
  });

  it('marca lote com lançamentos acima do retorno informado', () => {
    const r = conciliarRecebimentosConvenio([lotes[0]], [
      { id: 'a', tipo: 'receita', categoria: 'convenio_repasse', valor: 400, valor_pago: 400, status: 'pago', lote_tiss_id: 'l1', descricao: 'TISS 10', data: '2026-10-01' },
    ]);
    expect(r.lotes[0]).toMatchObject({ lancado: 400, diferenca: -100, situacao: 'lancado_acima_do_retorno' });
  });
});
