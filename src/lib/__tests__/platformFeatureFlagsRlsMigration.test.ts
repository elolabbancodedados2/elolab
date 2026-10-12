import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261011390000_platform_feature_flags_admin_only.sql';

describe('platform feature flags RLS migration', () => {
  it('removes authenticated-wide reads and leaves reads platform-admin-only', () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/DROP POLICY IF EXISTS ["']autenticado le flags["']/i);
    expect(sql).toMatch(/CREATE POLICY ["']plataforma le flags["'][\s\S]*?FOR SELECT TO authenticated[\s\S]*?USING\s*\(public\.is_platform_admin\(\)\)/i);
  });
});
