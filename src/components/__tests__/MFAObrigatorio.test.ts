import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { exigeMfa, mfaExigidoParaMim, proximoPassoMfa } from '../MFAObrigatorio';

describe('proximoPassoMfa', () => {
  it('pede o código quando a conta já tem fator', () => {
    expect(proximoPassoMfa({ fatorPendente: 'f1', exigido: true })).toBe('verificar');
    expect(proximoPassoMfa({ fatorPendente: 'f1', exigido: false })).toBe('verificar');
  });
  it('pede o cadastro quando o perfil é obrigado e não tem fator', () => {
    expect(proximoPassoMfa({ fatorPendente: null, exigido: true })).toBe('cadastrar');
  });
  it('libera quando não há fator nem obrigação', () => {
    expect(proximoPassoMfa({ fatorPendente: null, exigido: false })).toBe('liberar');
  });
});

describe('mfaExigidoParaMim', () => {
  beforeEach(() => rpc.mockReset());
  it('consulta a RPC do servidor', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(mfaExigidoParaMim()).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('mfa_exigido_para_mim');
  });
  it('devolve false em erro ou resposta inesperada', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    await expect(mfaExigidoParaMim()).resolves.toBe(false);
    rpc.mockResolvedValue({ data: 'true', error: null });
    await expect(mfaExigidoParaMim()).resolves.toBe(false);
  });
});

describe('exigeMfa', () => {
  it('reconhece o HINT do banco', () => {
    expect(exigeMfa({ code: '42501', hint: 'mfa_necessario' })).toBe(true);
    expect(exigeMfa({ code: '42501', hint: 'reautenticacao_necessaria' })).toBe(false);
    expect(exigeMfa(null)).toBe(false);
  });
});
