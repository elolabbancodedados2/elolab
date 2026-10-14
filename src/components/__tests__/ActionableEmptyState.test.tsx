import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionableEmptyState } from '../ActionableEmptyState';

describe('ActionableEmptyState', () => {
  it('explica a ausência e executa a ação principal', () => {
    const onAction = vi.fn();
    render(<ActionableEmptyState title="Nenhum relatório" description="Crie um para começar." actionLabel="Criar relatório" onAction={onAction} />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Nenhum relatório')).toBeInTheDocument();
    expect(screen.getByText('Crie um para começar.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Criar relatório' }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('permite oferecer uma segunda saída sem ação primária', () => {
    const onSecondaryAction = vi.fn();
    render(<ActionableEmptyState title="Sem resultados" description="Tente outra categoria." secondaryLabel="Mostrar todos" onSecondaryAction={onSecondaryAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar todos' }));
    expect(onSecondaryAction).toHaveBeenCalledOnce();
  });
});
