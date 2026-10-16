import { formatCsvCell } from '@/lib/csv';

export type AnalyticsChartColumn = { key: string; label: string };
export type AnalyticsChartRow = Record<string, string | number | null | undefined>;

export function buildAnalyticsChartCsv(input: {
  title: string;
  period: string;
  filters: string[];
  columns: AnalyticsChartColumn[];
  rows: AnalyticsChartRow[];
}): string {
  const lines = [
    [input.title],
    ['Período', input.period],
    ['Filtros', input.filters.length ? input.filters.join(' | ') : 'Nenhum filtro adicional'],
    [],
    input.columns.map((column) => column.label),
    ...input.rows.map((row) => input.columns.map((column) => row[column.key] ?? '')),
  ];

  return `\uFEFF${lines.map((line) => line.map(formatCsvCell).join(';')).join('\r\n')}`;
}
