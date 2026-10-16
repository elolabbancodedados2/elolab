import { describe, expect, it } from 'vitest';
import { buildAnalyticsChartCsv } from '../analyticsChartTable';

describe('exportação tabular dos gráficos do Analytics', () => {
  it('inclui período e filtros antes da tabela de dados', () => {
    const csv = buildAnalyticsChartCsv({
      title: 'Agendamentos por dia', period: '01/10/2026 a 14/10/2026',
      filters: ['Comparação: período anterior'], columns: [{ key: 'dia', label: 'Dia' }],
      rows: [{ dia: '14/10' }],
    });

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.indexOf('Período')).toBeLessThan(csv.indexOf('Dia'));
    expect(csv).toContain('01/10/2026 a 14/10/2026');
    expect(csv).toContain('Comparação: período anterior');
  });

  it('escapa aspas e neutraliza fórmulas em células exportadas', () => {
    const csv = buildAnalyticsChartCsv({
      title: 'Status', period: 'hoje', filters: [],
      columns: [{ key: 'nome', label: 'Nome' }], rows: [{ nome: '=SUM(1,2) "teste"' }],
    });

    expect(csv).toContain("\"'=SUM");
    expect(csv).toContain('""teste""');
  });
});
