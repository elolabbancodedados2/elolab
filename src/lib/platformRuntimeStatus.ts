export type RuntimeCheck = 'ok' | 'error';

export interface PlatformRuntimeStatus {
  buildId: string | null;
  builtAt: string | null;
  app: RuntimeCheck;
  auth: RuntimeCheck;
  database: RuntimeCheck;
  checkedAt: string;
}

export type RuntimeFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface RuntimeOptions {
  appUrl: string;
  supabaseUrl: string;
  publishableKey: string;
  fetcher?: RuntimeFetch;
  databaseCheck: (signal: AbortSignal) => Promise<{ data: unknown; error: unknown | null }>;
  now?: () => Date;
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function checkEndpoint(fetcher: RuntimeFetch, url: string, timeoutMs: number, init?: RequestInit): Promise<unknown> {
  const response = await fetcher(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error('unavailable');
  return response.json();
}

function checkDatabaseWithTimeout(
  check: RuntimeOptions['databaseCheck'],
  timeoutMs: number,
): Promise<{ data: unknown; error: unknown | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return Promise.resolve(check(controller.signal)).finally(() => clearTimeout(timer));
}

export async function checkPlatformRuntime(options: RuntimeOptions): Promise<PlatformRuntimeStatus> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 6000;
  const [appResult, authResult, databaseResult] = await Promise.allSettled([
    checkEndpoint(fetcher, new URL('/version.json', options.appUrl).toString(), timeoutMs),
    checkEndpoint(fetcher, new URL('/auth/v1/health', options.supabaseUrl).toString(), timeoutMs, {
      headers: { apikey: options.publishableKey },
    }),
    checkDatabaseWithTimeout(options.databaseCheck, timeoutMs),
  ]);

  const appBody = appResult.status === 'fulfilled' && isRecord(appResult.value) ? appResult.value : null;
  const authHealthy = authResult.status === 'fulfilled' && isRecord(authResult.value);
  const databaseHealthy = databaseResult.status === 'fulfilled'
    && databaseResult.value.error === null
    && isRecord(databaseResult.value.data)
    && databaseResult.value.data.ok === true;
  const buildId = typeof appBody?.build_id === 'string' && appBody.build_id.length > 0 ? appBody.build_id : null;
  const builtAt = typeof appBody?.built_at === 'string' && !Number.isNaN(Date.parse(appBody.built_at))
    ? appBody.built_at
    : null;

  return {
    buildId,
    builtAt,
    app: buildId && builtAt ? 'ok' : 'error',
    auth: authHealthy ? 'ok' : 'error',
    database: databaseHealthy ? 'ok' : 'error',
    checkedAt: (options.now?.() ?? new Date()).toISOString(),
  };
}
