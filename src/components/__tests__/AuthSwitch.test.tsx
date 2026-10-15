import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthSwitch } from '@/components/ui/auth-switch';

describe('AuthSwitch', () => {
  it('expõe o modo selecionado e alterna entre acesso e cadastro', () => {
    const onTabChange = vi.fn();
    render(<AuthSwitch activeTab="login" onTabChange={onTabChange} />);

    expect(screen.getByRole('group', { name: 'Modo de acesso' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Criar Conta' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Criar Conta' }));
    expect(onTabChange).toHaveBeenCalledWith('signup');
  });
});
