import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FinalizarAtendimentoDialog } from '../FinalizarAtendimentoDialog';

describe('FinalizarAtendimentoDialog', () => {
  it('preserva o contexto e permite tentar de novo quando a finalização falha', async () => {
    const onConfirm = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    render(<FinalizarAtendimentoDialog open pacienteNome="Ana Silva" onClose={onClose} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: '30 dias' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(30));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 dias' })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('fecha após confirmação concluída', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<FinalizarAtendimentoDialog open pacienteNome="Ana Silva" onClose={onClose} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: '15 dias' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onConfirm).toHaveBeenCalledWith(15);
  });
});
