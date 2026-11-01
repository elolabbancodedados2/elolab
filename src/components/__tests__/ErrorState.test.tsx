import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorState } from '../ErrorState';

describe('estado de erro do aplicativo', () => {
  it('anuncia o problema e permite tentar novamente', () => {
    const onRetry = vi.fn();

    render(
      <ErrorState
        title="Não foi possível carregar o dashboard"
        description="Confira sua conexão e tente novamente."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
