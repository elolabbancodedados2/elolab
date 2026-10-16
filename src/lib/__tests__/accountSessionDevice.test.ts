import { describe, expect, it, vi } from 'vitest';
import { describeAccountDevice, registerAccountSessionActivity } from '../accountSessionDevice';

describe('descrição aproximada do dispositivo da sessão', () => {
  it('identifica Safari em iPhone sem exibir identificadores pessoais', () => {
    expect(describeAccountDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1'))
      .toBe('Safari · iPhone');
  });

  it('identifica Chrome em Android', () => {
    expect(describeAccountDevice('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36'))
      .toBe('Chrome · Android');
  });

  it('reconhece Edge antes de Chrome em Windows', () => {
    expect(describeAccountDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0'))
      .toBe('Edge · Windows');
  });

  it('usa rótulos neutros para agente ausente ou não reconhecido', () => {
    expect(describeAccountDevice(null)).toBe('Navegador desconhecido · Dispositivo desconhecido');
    expect(describeAccountDevice('')).toBe('Navegador desconhecido · Dispositivo desconhecido');
    expect(describeAccountDevice('custom client')).toBe('Navegador desconhecido · Dispositivo desconhecido');
  });

  it('não envia heartbeat sem usuário, sessão ou aba visível', async () => {
    const updateLastAccess = vi.fn(async () => {});
    const touchSession = vi.fn(async () => {});
    const dependencies = { updateLastAccess, touchSession };

    await registerAccountSessionActivity({ userId: null, hasSession: true, isVisible: true, userAgent: 'ua' }, dependencies);
    await registerAccountSessionActivity({ userId: 'user-1', hasSession: false, isVisible: true, userAgent: 'ua' }, dependencies);
    await registerAccountSessionActivity({ userId: 'user-1', hasSession: true, isVisible: false, userAgent: 'ua' }, dependencies);

    expect(updateLastAccess).not.toHaveBeenCalled();
    expect(touchSession).not.toHaveBeenCalled();
  });

  it('registra atividade do perfil e da sessão atual sem repassar dados clínicos', async () => {
    const updateLastAccess = vi.fn(async () => {});
    const touchSession = vi.fn(async () => {});

    await registerAccountSessionActivity(
      { userId: 'user-1', hasSession: true, isVisible: true, userAgent: 'Chrome/124 Windows' },
      { updateLastAccess, touchSession },
    );

    expect(updateLastAccess).toHaveBeenCalledWith('user-1');
    expect(touchSession).toHaveBeenCalledWith('Chrome/124 Windows');
  });
});
