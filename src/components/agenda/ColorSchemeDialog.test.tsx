import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColorSchemeDialog } from './ColorSchemeDialog';

describe('ColorSchemeDialog', () => {
  it('preserva uma cor personalizada salva e oferece apenas a paleta funcional EloLab', () => {
    const onSave = vi.fn();
    const scheme = {
      criterion: 'status' as const,
      map: { agendado: '#7B6CF6', confirmado: 'hsl(var(--success))' },
    };

    render(
      <ColorSchemeDialog
        open
        onOpenChange={vi.fn()}
        scheme={scheme}
        onSave={onSave}
        medicos={[]}
        convenios={[]}
        tipos={[]}
      />,
    );

    const savedColor = screen.getByRole('button', { name: 'Manter cor atual #7B6CF6 para Agendado' });
    const primaryColor = screen.getByRole('button', { name: 'Usar Azul primário para Agendado' });
    expect(savedColor).toHaveAttribute('aria-pressed', 'true');
    expect(savedColor).toHaveClass('h-11', 'w-11');
    expect(primaryColor).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(primaryColor);
    expect(primaryColor).toHaveAttribute('aria-pressed', 'true');
    expect(savedColor).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSave).toHaveBeenCalledWith({
      criterion: 'status',
      map: expect.objectContaining({ agendado: 'hsl(var(--primary))' }),
    });
  });
});
