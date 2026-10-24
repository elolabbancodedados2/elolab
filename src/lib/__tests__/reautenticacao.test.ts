import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth } = vi.hoisted(() => ({
  auth: {
    mfa: { listFactors: vi.fn(), challengeAndVerify: vi.fn() },
    signInWithPassword: vi.fn(),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth } }));

import { exigeReautenticacao, fatorTotpVerificado, reautenticar } from '@/lib/reautenticacao';

const migrationPath = 'supabase/migrations/20261024150000_reautenticacao_controles_seguranca.sql';

describe('reautenticação para reduzir controles de segurança', () => {
  beforeEach(() => {
    auth.mfa.listFactors.mockReset();
    auth.mfa.challengeAndVerify.mockReset();
    auth.signInWithPassword.mockReset();
  });

  it('reconhece o erro do servidor que pede reautenticação', () => {
    expect(exigeReautenticacao({ hint: 'reautenticacao_necessaria', message: 'x' })).toBe(true);
    expect(exigeReautenticacao({ message: 'Outra pessoa atualizou' })).toBe(false);
    expect(exigeReautenticacao(null)).toBe(false);
  });

  it('localiza apenas fator TOTP verificado', async () => {
    auth.mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f0', status: 'unverified' }, { id: 'f1', status: 'verified' }] }, error: null });
    await expect(fatorTotpVerificado()).resolves.toBe('f1');
    auth.mfa.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    await expect(fatorTotpVerificado()).resolves.toBeNull();
  });

  it('com 2FA, renova a prova pelo código TOTP sem rebaixar a sessão para senha', async () => {
    auth.mfa.challengeAndVerify.mockResolvedValue({ error: null });
    await reautenticar({ email: 'a@b.c', factorId: 'f1', codigo: '123456', senha: '' });
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('sem 2FA, confere a senha do próprio e-mail da sessão', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    await reautenticar({ email: 'a@b.c', factorId: null, codigo: '', senha: 'Senha-Forte1' });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'Senha-Forte1' });
  });

  it('propaga falhas e rejeita código malformado sem chamar o servidor', async () => {
    await expect(reautenticar({ email: 'a@b.c', factorId: 'f1', codigo: '12', senha: '' })).rejects.toThrow(/6 dígitos/);
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
    auth.signInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') });
    await expect(reautenticar({ email: 'a@b.c', factorId: null, codigo: '', senha: 'errada' })).rejects.toThrow('Invalid login credentials');
  });

  it('o banco exige prova recente (amr) e AAL2 quando há fator para reduzir config_seguranca', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.reautenticacao_recente\(/i);
    expect(sql).toMatch(/auth\.jwt\(\)\s*->\s*'amr'/i);
    expect(sql).toMatch(/auth\.mfa_factors/i);
    expect(sql).toMatch(/'aal2'/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.config_seguranca_reduzida\(/i);
    expect(sql).toMatch(/sessionTimeoutMin/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF valor ON public\.configuracoes_clinica/i);
    expect(sql).toMatch(/chave\s*=\s*'config_seguranca'/i);
    expect(sql).toMatch(/HINT\s*=\s*'reautenticacao_necessaria'/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reautenticacao_recente/i);
  });
});
