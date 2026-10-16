import { describe, expect, it, vi } from 'vitest';
import { checkPlatformRuntime, type RuntimeFetch } from '../platformRuntimeStatus';

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('checkPlatformRuntime', () => {
  it('confere versão do frontend, health público do Auth e RPC sem expor detalhes', async () => {
    const fetcher = vi.fn<RuntimeFetch>()
      .mockResolvedValueOnce(response({ build_id: 'sha-qa-100', built_at: '2026-10-14T13:00:00.000Z' }))
      .mockResolvedValueOnce(response({ name: 'GoTrue', version: 'v-test' }));
    const databaseCheck = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });

    const result = await checkPlatformRuntime({
      appUrl: 'https://app.qa.invalid',
      supabaseUrl: 'https://api.qa.invalid',
      publishableKey: 'public-test-key',
      fetcher,
      databaseCheck,
      now: () => new Date('2026-10-14T13:01:00.000Z'),
    });

    expect(result).toEqual({
      buildId: 'sha-qa-100', builtAt: '2026-10-14T13:00:00.000Z',
      app: 'ok', auth: 'ok', database: 'ok', checkedAt: '2026-10-14T13:01:00.000Z',
    });
    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://app.qa.invalid/version.json', expect.objectContaining({ cache: 'no-store' }));
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://api.qa.invalid/auth/v1/health', expect.objectContaining({
      cache: 'no-store', headers: { apikey: 'public-test-key' },
    }));
    expect(databaseCheck).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain('v-test');
  });

  it('marca serviços independentes e ausências de versão sem retornar erros brutos', async () => {
    const fetcher = vi.fn<RuntimeFetch>()
      .mockResolvedValueOnce(response({ detail: 'private host/path' }, 503))
      .mockRejectedValueOnce(new Error('private auth endpoint'));
    const result = await checkPlatformRuntime({
      appUrl: 'https://app.qa.invalid',
      supabaseUrl: 'https://api.qa.invalid',
      publishableKey: 'public-test-key',
      fetcher,
      databaseCheck: async () => ({ data: null, error: new Error('private database host') }),
    });

    expect(result).toMatchObject({ app: 'error', auth: 'error', database: 'error', buildId: null, builtAt: null });
    expect(JSON.stringify(result)).not.toMatch(/private|host|endpoint/);
  });

  it('mantém frontend e Auth saudáveis quando o check Postgres falha', async () => {
    const fetcher = vi.fn<RuntimeFetch>()
      .mockResolvedValueOnce(response({ build_id: 'sha-qa-100', built_at: '2026-10-14T13:00:00.000Z' }))
      .mockResolvedValueOnce(response({ name: 'GoTrue' }));
    const result = await checkPlatformRuntime({
      appUrl: 'https://app.qa.invalid',
      supabaseUrl: 'https://api.qa.invalid',
      publishableKey: 'public-test-key',
      fetcher,
      databaseCheck: async () => ({ data: null, error: new Error('database unavailable') }),
    });

    expect(result).toMatchObject({ app: 'ok', auth: 'ok', database: 'error', buildId: 'sha-qa-100' });
  });

  it('aborta o check Postgres quando excede o timeout', async () => {
    const fetcher = vi.fn<RuntimeFetch>()
      .mockResolvedValueOnce(response({ build_id: 'sha-qa-100', built_at: '2026-10-14T13:00:00.000Z' }))
      .mockResolvedValueOnce(response({ name: 'GoTrue' }));
    const databaseCheck = vi.fn((signal: AbortSignal) => new Promise<{ data: unknown; error: unknown | null }>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('private timeout')), { once: true });
    }));
    const result = await checkPlatformRuntime({
      appUrl: 'https://app.qa.invalid',
      supabaseUrl: 'https://api.qa.invalid',
      publishableKey: 'public-test-key',
      fetcher,
      databaseCheck,
      timeoutMs: 1,
    });

    expect(result).toMatchObject({ app: 'ok', auth: 'ok', database: 'error' });
  });
});
