import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const download = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auditExport', () => ({ downloadStringAsFile: download }));
vi.mock('@/lib/dateOnly', async (original) => ({ ...(await original<Record<string, unknown>>()), todaySaoPauloDateOnly: () => '2026-10-24' }));

import { RelatorioFaturamentoCompetencia } from '../RelatorioFaturamentoCompetencia';

describe('RelatorioFaturamentoCompetencia', () => {
  it('mostra os filtros aplicados, o total e exporta o CSV do período', () => {
    render(<RelatorioFaturamentoCompetencia
      convenios={[{ id: 'c1', nome: 'Unimed' }]}
      glosas={[]}
      lotes={[
        { id: 'l1', numero_lote: '1', competencia: '2026-09-01', convenio_id: 'c1', convenio_nome: 'Unimed', status: 'pago', quantidade_guias: 2, valor_apresentado: 150, valor_pago: 100 },
        { id: 'l2', numero_lote: '2', competencia: '2026-05-01', convenio_id: 'c1', convenio_nome: 'Unimed', status: 'pago', quantidade_guias: 1, valor_apresentado: 999, valor_pago: 0 },
      ]}
    />);

    expect(screen.getByRole('status')).toHaveTextContent('08/2026 a 10/2026 · Todos os convênios');
    expect(screen.getByRole('status')).toHaveTextContent('1 lote(s)');
    expect(screen.getByText('Total')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }));
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ filename: 'faturamento-competencia-2026-08-a-2026-10.csv' }));
  });
});
