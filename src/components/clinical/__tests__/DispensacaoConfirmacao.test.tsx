import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DispensacaoConfirmacao } from '../DispensacaoConfirmacao';

describe('DispensacaoConfirmacao', () => {
  it('envia o estoque_id escolhido e a quantidade conferida', () => {
    const onConfirm = vi.fn();
    render(<DispensacaoConfirmacao open enviando={false} onOpenChange={vi.fn()} onConfirm={onConfirm} plano={[
      { nome: 'Dipirona 500mg', quantidadeTexto: '2', quantidade: 2, sugeridoId: 'e1', alerta: null,
        opcoes: [{ id: 'e1', nome: 'Dipirona 500mg', quantidade: 10, lote: 'L1', validade: '2027-01-01' }] },
      { nome: 'Xarope', quantidadeTexto: 'meio frasco', quantidade: null, sugeridoId: null, alerta: 'Xarope: não encontrado no estoque', opcoes: [] },
    ]} />);

    expect(screen.getByText('Xarope: não encontrado no estoque')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dar baixa (1)' }));
    expect(onConfirm).toHaveBeenCalledWith([{ nome: 'Dipirona 500mg', quantidade: '3', estoqueId: 'e1' }]);
  });

  it('bloqueia quantidade acima do saldo do lote', () => {
    render(<DispensacaoConfirmacao open enviando={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} plano={[
      { nome: 'Soro', quantidadeTexto: '20', quantidade: 20, sugeridoId: null, alerta: null,
        opcoes: [{ id: 's1', nome: 'Soro', quantidade: 5 }] },
    ]} />);
    expect(screen.getByRole('button', { name: 'Dar baixa (0)' })).toBeDisabled();
  });
});
