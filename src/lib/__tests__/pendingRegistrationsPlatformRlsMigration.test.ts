import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20261011380000_registros_pendentes_so_plataforma.sql',
);

describe('pending registration platform-only RLS migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('removes legacy clinic-admin read, write and insert policies', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "admins_select_registros"');
    expect(sql).toContain('DROP POLICY IF EXISTS "authenticated_update_own_registros_v2"');
    expect(sql).toContain('DROP POLICY IF EXISTS "admin_insert_registros"');
  });

  it('scopes authenticated direct table access to platform admins', () => {
    expect(sql).toMatch(/FOR SELECT TO authenticated\s+USING \(public\.is_platform_admin\(\)\)/);
    expect(sql).toMatch(/FOR UPDATE TO authenticated\s+USING \(public\.is_platform_admin\(\)\)\s+WITH CHECK \(public\.is_platform_admin\(\)\)/);
    expect(sql).toMatch(/FOR INSERT TO authenticated\s+WITH CHECK \(public\.is_platform_admin\(\)\)/);
  });

  it('keeps anonymous direct reads closed', () => {
    expect(sql).toMatch(/FOR SELECT TO anon\s+USING \(false\)/);
  });
});
