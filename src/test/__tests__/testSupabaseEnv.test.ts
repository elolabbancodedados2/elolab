import { describe, expect, it } from 'vitest';
import {
  createLocalTestSupabaseEnv,
  resolveLocalQaSupabaseConfig,
} from '../../../scripts/test-supabase-env';

describe('Supabase test environment safety', () => {
  it('defaults to a loopback URL and a synthetic key', () => {
    expect(createLocalTestSupabaseEnv({})).toEqual({
      url: 'http://127.0.0.1:54321',
      publishableKey: 'synthetic-local-test-key',
      anonKey: 'synthetic-local-test-key',
    });
  });

  it('rejects non-loopback URLs for unit and E2E test clients', () => {
    expect(() => createLocalTestSupabaseEnv({ VITE_SUPABASE_URL: 'https://remote.example' }))
      .toThrow(/loopback/i);
  });

  it('requires explicit URL and key for the local security suites', () => {
    expect(resolveLocalQaSupabaseConfig({})).toBeNull();
    expect(resolveLocalQaSupabaseConfig({ QA_SUPABASE_URL: 'http://127.0.0.1:54321' })).toBeNull();
    expect(resolveLocalQaSupabaseConfig({
      QA_SUPABASE_URL: 'http://127.0.0.1:54321',
      QA_SUPABASE_ANON_KEY: 'synthetic-qa-key',
    })).toEqual({ url: 'http://127.0.0.1:54321', anonKey: 'synthetic-qa-key', disposable: false });
    expect(resolveLocalQaSupabaseConfig({
      QA_SUPABASE_URL: 'http://127.0.0.1:54321',
      QA_SUPABASE_ANON_KEY: 'synthetic-qa-key',
      QA_SUPABASE_DISPOSABLE: 'ELOLAB_LOCAL_DISPOSABLE',
    })?.disposable).toBe(true);
  });

  it('rejects cloud hosts for local security suites', () => {
    expect(() => resolveLocalQaSupabaseConfig({
      QA_SUPABASE_URL: 'https://remote.example',
      QA_SUPABASE_ANON_KEY: 'synthetic-qa-key',
    })).toThrow(/loopback/i);
  });
});
