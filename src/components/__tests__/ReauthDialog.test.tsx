import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth } = vi.hoisted(() => ({
  auth: {
    mfa: { listFactors: vi.fn(), challengeAndVerify: vi.fn() },
    signInWithPassword: vi.fn(),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { ReauthDialog } from '@/components/ReauthDialog';

describe('ReauthDialog', () => {
  beforeEach(() => {
    auth.mfa.listFactors.mockReset();
    auth.mfa.challengeAndVerify.mockReset();
    auth.signInWithPassword.mockReset();
  });

  it('pede a senha quando a conta não tem 2FA e só confirma depois da prova', async () => {
    auth.mfa.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    auth.signInWithPassword.mockResolvedValue({ error: null });
    const onConfirmed = vi.fn().mockResolvedValue(undefined);
    render(<ReauthDialog open email="admin@clinica.test" title="Confirmar" description="Ação sensível" onOpenChange={() => {}} onConfirmed={onConfirmed} />);

    const senha = await screen.findByLabelText('Senha atual');
    fireEvent.change(senha, { target: { value: 'Senha-Forte1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar identidade' }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'admin@clinica.test', password: 'Senha-Forte1' });
  });

  it('pede o código TOTP quando há 2FA e não confirma se a verificação falhar', async () => {
    auth.mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f1', status: 'verified' }] }, error: null });
    auth.mfa.challengeAndVerify.mockResolvedValue({ error: new Error('Código inválido') });
    const onConfirmed = vi.fn();
    render(<ReauthDialog open email="admin@clinica.test" title="Confirmar" description="Ação sensível" onOpenChange={() => {}} onConfirmed={onConfirmed} />);

    const codigo = await screen.findByLabelText('Código do autenticador');
    expect(screen.queryByLabelText('Senha atual')).toBeNull();
    fireEvent.change(codigo, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar identidade' }));

    await waitFor(() => expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' }));
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});
