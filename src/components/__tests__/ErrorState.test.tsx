import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorState } from '../ErrorState';

describe('estado de erro do aplicativo', () => {
  it('anuncia o problema e permite tentar novamente', () => {
    const onRetry = vi.fn();

    render(
      <ErrorState
        title="NÃ£o foi possÃ­vel carregar o dashboard"
        description="Confira sua conexÃ£o e tente novamente."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('NÃ£o foi possÃ­vel carregar o dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
