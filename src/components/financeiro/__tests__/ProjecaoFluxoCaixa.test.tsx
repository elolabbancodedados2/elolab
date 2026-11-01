import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/dateOnly', async (original) => ({ ...(await original<Record<string, unknown>>()), todaySaoPauloDateOnly: () => '2026-10-24' }));

import { ProjecaoFluxoCaixa } from '../ProjecaoFluxoCaixa';

const vencida = { id: 'r1', tipo: 'receita', status: 'atrasado', valor: 70, valor_pago: 0, data: '2026-08-01', data_vencimento: '2026-08-01' };

describe('ProjecaoFluxoCaixa', () => {
  it('troca o cenário e explica a regra aplicada', () => {
    render(<ProjecaoFluxoCaixa lancamentos={[vencida]} realizados={[{ tipo: 'receita', valor: 10, data: '2026-10-02' }]} />);
    const linhaOutubro = screen.getByRole('row', { name: /out\/2026/ });
    expect(within(linhaOutubro).getAllByText(/R\$\s0,00/).length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent('vencidas há até 30 dias');

    fireEvent.click(screen.getByRole('button', { name: 'Otimista' }));
    expect(screen.getByRole('button', { name: 'Otimista' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('row', { name: /out\/2026/ })).getByText(/R\$\s70,00/)).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /out\/2026/ })).getByText(/R\$\s10,00/)).toBeInTheDocument();
  });

  it('soma os lotes TISS enviados como receita prevista e avisa quando não carregam', () => {
    const { rerender } = render(<ProjecaoFluxoCaixa lancamentos={[]} realizados={[]} lotesTiss={[{
      id: 'lote-1', status: 'enviado', valor_apresentado: 300, valor_pago: 0, enviado_em: '2026-10-10', convenios: { prazo_retorno: 30 },
    }]} />);
    expect(within(screen.getByRole('row', { name: /nov\/2026/ })).getAllByText(/R\$\s300,00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/lote TISS enviado/)).toBeInTheDocument();

    rerender(<ProjecaoFluxoCaixa lancamentos={[]} realizados={[]} lotesTissIndisponivel />);
    expect(screen.getByText(/Não foi possível somar os lotes TISS/)).toBeInTheDocument();
  });
});
