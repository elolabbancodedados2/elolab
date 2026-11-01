import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(async () => undefined),
  toastError: vi.fn(),
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: { id: 'u1' }, profile: { clinica_id: null }, signOut: mocks.signOut }),
}));
vi.mock('@/integrations/supabase/client', () => {
  const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: null, error: null }) };
  return { supabase: { from: () => builder } };
});
vi.mock('@/lib/configClinica', () => ({
  CONFIG_SEGURANCA_ATUALIZADA_EVENT: 'config-seguranca-atualizada',
  lerConfigsClinica: vi.fn(async () => ({})),
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, warning: vi.fn() } }));

import { CHAVE_ATIVIDADE_SESSAO, useSessionTimeout } from '../useSessionTimeout';

const MIN = 60_000;

describe('useSessionTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    localStorage.clear();
    mocks.signOut.mockClear();
    mocks.toastError.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('avisa com contagem regressiva 5 minutos antes e "Continuar conectado" mantém a sessão', () => {
    const { result } = renderHook(() => useSessionTimeout());
    expect(result.current.avisoAberto).toBe(false);

    act(() => { vi.advanceTimersByTime(25 * MIN + 1000); });
    expect(result.current.avisoAberto).toBe(true);
    expect(result.current.segundosRestantes).toBeGreaterThan(280);
    expect(result.current.segundosRestantes).toBeLessThanOrEqual(300);

    act(() => { result.current.continuar(); });
    expect(result.current.avisoAberto).toBe(false);

    act(() => { vi.advanceTimersByTime(10 * MIN); });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('encerra só a sessão deste navegador depois do tempo sem uso', async () => {
    renderHook(() => useSessionTimeout());
    await act(async () => { vi.advanceTimersByTime(30 * MIN + 1000); });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.toastError).toHaveBeenCalledWith('Sessão encerrada por inatividade.', expect.anything());
  });

  it('atividade em outra aba (storage compartilhado) mantém esta aba aberta', () => {
    renderHook(() => useSessionTimeout());
    act(() => { vi.advanceTimersByTime(20 * MIN); });
    act(() => {
      localStorage.setItem(CHAVE_ATIVIDADE_SESSAO, String(Date.now()));
      window.dispatchEvent(new StorageEvent('storage', { key: CHAVE_ATIVIDADE_SESSAO, newValue: String(Date.now()) }));
    });
    act(() => { vi.advanceTimersByTime(20 * MIN); });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('movimento do mouse conta como atividade e é compartilhado com as outras abas', () => {
    renderHook(() => useSessionTimeout());
    act(() => { vi.advanceTimersByTime(20 * MIN); });
    act(() => { window.dispatchEvent(new MouseEvent('mousemove')); });
    expect(Number(localStorage.getItem(CHAVE_ATIVIDADE_SESSAO))).toBe(Date.now());
    act(() => { vi.advanceTimersByTime(20 * MIN); });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('com o aviso aberto, um movimento do mouse não fecha o aviso sozinho', () => {
    const { result } = renderHook(() => useSessionTimeout());
    act(() => { vi.advanceTimersByTime(26 * MIN); });
    expect(result.current.avisoAberto).toBe(true);
    act(() => { window.dispatchEvent(new MouseEvent('mousemove')); });
    expect(result.current.avisoAberto).toBe(true);
  });
});
