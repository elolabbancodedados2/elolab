import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildAnalyticsChartCsv, type AnalyticsChartColumn, type AnalyticsChartRow } from '@/lib/analyticsChartTable';

export function AccessibleChartTable({ title, period, filters, columns, rows }: {
  title: string;
  period: string;
  filters: string[];
  columns: AnalyticsChartColumn[];
  rows: AnalyticsChartRow[];
}) {
  const exportCsv = () => {
    const content = buildAnalyticsChartCsv({ title, period, filters, columns, rows });
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <details className="mt-3 rounded-md border px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Ver dados em tabela
      </summary>
      <div className="mt-3 space-y-3">
        <div className="text-xs text-muted-foreground" role="note">
          <p><strong className="text-foreground">Período:</strong> {period}</p>
          <p><strong className="text-foreground">Filtros:</strong> {filters.length ? filters.join(' · ') : 'Nenhum filtro adicional'}</p>
        </div>
        <Button size="sm" variant="outline" className="gap-2" onClick={exportCsv} aria-label={`Exportar tabela ${title}`}>
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] border-collapse text-sm">
            <caption className="sr-only">{title} — período: {period}; filtros: {filters.join(', ') || 'nenhum filtro adicional'}</caption>
            <thead>
              <tr className="border-b text-left">
                {columns.map((column) => <th key={column.key} scope="col" className="px-2 py-2 font-semibold">{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => <tr key={index} className="border-b last:border-0">
                {columns.map((column) => {
                  const value = row[column.key];
                  return <td key={column.key} className="px-2 py-2 tabular-nums">{typeof value === 'number' ? value.toLocaleString('pt-BR') : String(value ?? '—')}</td>;
                })}
              </tr>)}
              {rows.length === 0 && <tr><td colSpan={columns.length} className="px-2 py-4 text-center text-muted-foreground">Sem dados no período.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
