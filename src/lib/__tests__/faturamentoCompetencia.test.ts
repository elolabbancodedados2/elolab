import { describe, expect, it } from 'vitest';
import { csvFaturamentoCompetencia, relatorioFaturamentoCompetencia, type FiltrosFaturamento } from '../faturamentoCompetencia';

const lotes = [
  { id: 'l1', numero_lote: '10', competencia: '2026-08-01', convenio_id: 'c1', convenio_nome: 'Unimed', status: 'pago', quantidade_guias: 3, valor_apresentado: 0.1, valor_pago: 0.1 },
  { id: 'l2', numero_lote: '11', competencia: '2026-08-01', convenio_id: 'c1', convenio_nome: 'Unimed', status: 'pago_parcial', quantidade_guias: 2, valor_apresentado: 0.2, valor_pago: 0.05 },
  { id: 'l3', numero_lote: '12', competencia: '2026-09-01', convenio_id: 'c2', convenio_nome: 'Amil', status: 'rascunho', quantidade_guias: 1, valor_apresentado: 50, valor_pago: 0 },
  { id: 'l4', numero_lote: '13', competencia: '2026-07-01', convenio_id: 'c2', convenio_nome: 'Amil', status: 'enviado', quantidade_guias: 1, valor_apresentado: 99, valor_pago: 0 },
  { id: 'l5', numero_lote: '14', competencia: '2026-08-01', convenio_id: 'c2', convenio_nome: 'Amil', status: 'cancelado', quantidade_guias: 1, valor_apresentado: 70, valor_pago: 0 },
];
const glosas = [
  { lote_id: 'l2', status: 'aceita', valor_glosado: 0.15, valor_recuperado: 0.1 },
  { lote_id: 'l2', status: 'cancelada', valor_glosado: 5, valor_recuperado: 0 },
];
const filtros: FiltrosFaturamento = { competenciaInicial: '2026-08', competenciaFinal: '2026-09', convenioId: 'todos', situacao: 'faturados' };

describe('relatório de faturamento por competência', () => {
  it('agrupa por competência e convênio, respeitando período, convênio e situação', () => {
    const r = relatorioFaturamentoCompetencia(lotes, glosas, filtros);
    expect(r.erro).toBeNull();
    expect(r.lotes.map(l => l.id)).toEqual(['l1', 'l2']);
    expect(r.linhas).toEqual([
      { competencia: '2026-08', convenio: 'Unimed', lotes: 2, guias: 5, apresentado: 0.3, recebido: 0.15, glosado: 0.15, recuperado: 0.1, aReceber: 0.15 },
    ]);
    expect(r.totais).toEqual({ lotes: 2, guias: 5, apresentado: 0.3, recebido: 0.15, glosado: 0.15, recuperado: 0.1, aReceber: 0.15 });
  });

  it('inclui rascunhos somente quando a situação pede todos, e nunca mistura cancelados por padrão', () => {
    const r = relatorioFaturamentoCompetencia(lotes, glosas, { ...filtros, situacao: 'todos_exceto_cancelados' });
    expect(r.lotes.map(l => l.id)).toEqual(['l1', 'l2', 'l3']);
    const comCancelados = relatorioFaturamentoCompetencia(lotes, glosas, { ...filtros, situacao: 'todos', convenioId: 'c2' });
    expect(comCancelados.lotes.map(l => l.id)).toEqual(['l5', 'l3']);
  });

  it('recusa período invertido ou inválido', () => {
    expect(relatorioFaturamentoCompetencia(lotes, glosas, { ...filtros, competenciaInicial: '2026-10' }).erro).toMatch(/inicial/);
    expect(relatorioFaturamentoCompetencia(lotes, glosas, { ...filtros, competenciaFinal: '' }).erro).toMatch(/válid/);
  });

  it('exporta filtros, linhas, total e os lotes usados no cálculo', () => {
    const r = relatorioFaturamentoCompetencia(lotes, glosas, filtros);
    const csv = csvFaturamentoCompetencia(r, filtros, 'Todos os convênios');
    expect(csv).toContain('"Competência";"08/2026 a 09/2026"');
    expect(csv).toContain('"Situação";"Faturados (enviados, em processamento, pagos ou rejeitados)"');
    expect(csv).toContain('"08/2026";"Unimed";"2";"5";"0,30";"0,15";"0,15";"0,10";"0,15"');
    expect(csv).toContain('"Total";"";"2";"5";"0,30";"0,15";"0,15";"0,10";"0,15"');
    expect(csv).toContain('"11";"Unimed";"08/2026";"pago parcial";"2";"0,20";"0,05"');
  });
});
