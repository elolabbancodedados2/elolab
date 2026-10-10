export type TestEnvironment = Record<string, string | undefined>;

export const DEFAULT_LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const SYNTHETIC_TEST_KEY = 'synthetic-local-test-key';

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function createLocalTestSupabaseEnv(env: TestEnvironment) {
  const url = env.VITE_SUPABASE_URL?.trim() || DEFAULT_LOCAL_SUPABASE_URL;
  if (!isLoopbackUrl(url)) {
    throw new Error('Test mode only permits a loopback Supabase URL.');
  }

  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    env.VITE_SUPABASE_ANON_KEY?.trim() || SYNTHETIC_TEST_KEY;

  return {
    url,
    publishableKey,
    anonKey: env.VITE_SUPABASE_ANON_KEY?.trim() || publishableKey,
  };
}

export function createViteTestSupabaseDefine(env: TestEnvironment) {
  const testEnv = createLocalTestSupabaseEnv(env);
  return {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(testEnv.url),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(testEnv.publishableKey),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(testEnv.anonKey),
  };
}

export function resolveLocalQaSupabaseConfig(env: TestEnvironment) {
  const url = env.QA_SUPABASE_URL?.trim();
  const anonKey = env.QA_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  if (!isLoopbackUrl(url)) {
    throw new Error('Security suites only permit a loopback QA Supabase URL.');
  }
  return {
    url,
    anonKey,
    disposable: env.QA_SUPABASE_DISPOSABLE === 'ELOLAB_LOCAL_DISPOSABLE',
  };
}
