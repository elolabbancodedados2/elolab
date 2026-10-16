import { describe, expect, it, vi } from 'vitest';
import { checkNotificationSendLimits } from '../../../supabase/functions/_shared/notificationRateLimit';

function makeRateLimitClient(results: Array<{ data: boolean; error: null | { message: string } }>) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    return results.shift() ?? { data: true, error: null };
  });
  return { client: { rpc }, calls, rpc };
}

describe('limites de envio de notificações', () => {
  it('aplica primeiro o limite por clínica e não consulta o destinatário quando a clínica excedeu', async () => {
    const { client, calls } = makeRateLimitClient([{ data: false, error: null }]);
    const result = await checkNotificationSendLimits(client, {
      clinicId: 'clinic-qa', channel: 'whatsapp', destination: '+55 (11) 99999-1234', hashSecret: 'synthetic-test-key',
    });

    expect(result).toBe('clinic');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: 'checar_rate_limit',
      args: { p_chave: 'notification:clinic:clinic-qa', p_limite: 50, p_janela_segundos: 60 },
    });
  });

  it('limita WhatsApp a um envio por número a cada minuto sem persistir o número na chave', async () => {
    const { client, calls } = makeRateLimitClient([
      { data: true, error: null },
      { data: false, error: null },
    ]);
    const result = await checkNotificationSendLimits(client, {
      clinicId: 'clinic-qa', channel: 'whatsapp', destination: '+55 (11) 99999-1234', hashSecret: 'synthetic-test-key',
    });

    expect(result).toBe('recipient');
    expect(calls).toHaveLength(2);
    expect(calls[1].args.p_limite).toBe(1);
    expect(calls[1].args.p_janela_segundos).toBe(60);
    expect(String(calls[1].args.p_chave)).toMatch(/^notification:whatsapp:clinic-qa:[a-f0-9]{64}$/);
    expect(String(calls[1].args.p_chave)).not.toContain('11999991234');
  });

  it('falha fechada e não libera envio se o RPC de limite estiver indisponível', async () => {
    const { client } = makeRateLimitClient([{ data: false, error: { message: 'unavailable' } }]);
    await expect(checkNotificationSendLimits(client, {
      clinicId: 'clinic-qa', channel: 'email', destination: 'patient@example.test',
    })).rejects.toThrow('Não foi possível confirmar o limite de envios.');
  });

  it('usa a mesma chave para o mesmo número com ou sem código de país e pontuação', async () => {
    const international = makeRateLimitClient([{ data: true, error: null }, { data: true, error: null }]);
    const local = makeRateLimitClient([{ data: true, error: null }, { data: true, error: null }]);
    await checkNotificationSendLimits(international.client, {
      clinicId: 'clinic-qa', channel: 'whatsapp', destination: '+55 (11) 99999-1234', hashSecret: 'synthetic-test-key',
    });
    await checkNotificationSendLimits(local.client, {
      clinicId: 'clinic-qa', channel: 'whatsapp', destination: '11999991234', hashSecret: 'synthetic-test-key',
    });

    expect(international.calls[1].args.p_chave).toBe(local.calls[1].args.p_chave);
  });

  it('usa HMAC com segredo apenas do servidor para impedir teste de dicionário do número', async () => {
    const first = makeRateLimitClient([{ data: true, error: null }, { data: true, error: null }]);
    const rotatedSecret = makeRateLimitClient([{ data: true, error: null }, { data: true, error: null }]);
    await checkNotificationSendLimits(first.client, {
      clinicId: 'clinic-qa', channel: 'whatsapp', destination: '11999991234', hashSecret: 'secret-one',
    });
    await checkNotificationSendLimits(rotatedSecret.client, {
      clinicId: 'clinic-qa', channel: 'whatsapp', destination: '11999991234', hashSecret: 'secret-two',
    });

    expect(first.calls[1].args.p_chave).not.toBe(rotatedSecret.calls[1].args.p_chave);
    expect(String(first.calls[1].args.p_chave)).not.toContain('secret-one');
  });

  it('aplica a cota mensal existente e não aplica o limite telefônico ao e-mail', async () => {
    const { client, calls } = makeRateLimitClient([{ data: true, error: null }]);
    const result = await checkNotificationSendLimits(client, {
      clinicId: 'clinic-qa', channel: 'email', destination: 'patient@example.test',
    });

    expect(result).toBeNull();
    expect(calls).toHaveLength(1);
  });
});
