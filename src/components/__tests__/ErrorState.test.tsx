import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorState, friendlyErrorMessage } from '../ErrorState';

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

describe('friendlyErrorMessage', () => {
  it('traduz erro do Postgres pelo código', () => {
    expect(friendlyErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint' }, 'x')).toBe(
      'Já existe um registro igual a este.',
    );
  });

  it('usa o fallback para código desconhecido', () => {
    expect(friendlyErrorMessage({ code: '23P01', message: 'conflicting key value violates exclusion constraint' }, 'Falhou.')).toBe('Falhou.');
  });

  it('mantém mensagem própria em português', () => {
    expect(friendlyErrorMessage(new Error('Paciente já fez check-in hoje.'), 'Falhou.')).toBe('Paciente já fez check-in hoje.');
  });

  it('esconde texto técnico em inglês', () => {
    expect(friendlyErrorMessage(new TypeError("Cannot read properties of undefined (reading 'id')"), 'Falhou.')).toBe('Falhou.');
    expect(friendlyErrorMessage(new Error('Edge Function returned a non-2xx status code'), 'Falhou.')).toBe('Falhou.');
    expect(friendlyErrorMessage(new Error('Invalid input'), 'Falhou.')).toBe('Falhou.');
  });

  it('mantém o fallback padrão de carregamento', () => {
    expect(friendlyErrorMessage(undefined)).toMatch(/carregar estas informações/);
  });
});
