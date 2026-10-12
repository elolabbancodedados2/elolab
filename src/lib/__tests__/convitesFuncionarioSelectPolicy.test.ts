import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261011190000_convites_funcionario_select_admin.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('acesso de leitura dos convites de funcionário', () => {
  it('remove a policy ampla anterior e restringe a leitura à plataforma e admin da clínica', () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS convites_funcionario_select_scoped_v3\s+ON public\.convites_funcionario/i);
    expect(migration).toMatch(/CREATE POLICY convites_funcionario_select_scoped_v4[\s\S]*?FOR SELECT TO authenticated[\s\S]*?public\.is_platform_admin\(\)[\s\S]*?public\.is_admin\(auth\.uid\(\)\)[\s\S]*?clinica_id = public\.get_my_clinica_id\(\)/i);
    expect(migration).not.toMatch(/USING\s*\(\s*public\.is_platform_admin\(\)\s+OR\s+clinica_id = public\.get_my_clinica_id\(\)\s*\)/i);
  });
});
