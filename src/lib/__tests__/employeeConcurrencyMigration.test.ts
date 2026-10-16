import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261014120000_concorrencia_edicao_funcionario.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const page = readFileSync('src/pages/Funcionarios.tsx', 'utf8');

describe('proteção contra sobrescrita concorrente da equipe', () => {
  it('adiciona versão monotônica por alteração na ficha do funcionário', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS edit_version bigint NOT NULL DEFAULT 1/i);
    expect(migration).toMatch(/NEW\.edit_version\s*:=\s*OLD\.edit_version\s*\+\s*1/i);
    expect(migration).toMatch(/BEFORE UPDATE ON public\.funcionarios/i);
  });

  it('compara a versão esperada sob lock antes de trocar papéis', () => {
    const syncFunction = migration.split('CREATE OR REPLACE FUNCTION public.sync_employee_roles_if_unchanged(')[1] ?? '';
    expect(syncFunction).toMatch(/_expected_version bigint/i);
    expect(syncFunction).toMatch(/SELECT\s+f\.user_id,\s*f\.edit_version\s+INTO[\s\S]*?FOR UPDATE/i);
    expect(syncFunction).toMatch(/v_current_version IS DISTINCT FROM _expected_version/i);
    expect(syncFunction).toMatch(/USING ERRCODE = '40001'/i);
  });

  it('mantém autorização da clínica e grants restritos à sessão autenticada', () => {
    expect(migration).toMatch(/public\.is_admin\(auth\.uid\(\)\)/i);
    expect(migration).toMatch(/f\.id = _funcionario_id AND f\.clinica_id = v_clinica_id/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.sync_employee_roles_if_unchanged\([\s\S]*?FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.sync_employee_roles_if_unchanged\([\s\S]*?TO authenticated/i);
  });

  it('preserva a revogação de sessões ao inativar funcionário vinculado', () => {
    const syncFunction = migration.split('CREATE OR REPLACE FUNCTION public.sync_employee_roles_if_unchanged(')[1] ?? '';
    expect(syncFunction).toMatch(/ELSE[\s\S]*?PERFORM public\.admin_encerrar_sessoes\(v_user_id\);[\s\S]*?END IF;/i);
  });

  it('envia a versão carregada, usa compare-and-set e pede recarga em conflito', () => {
    expect(page).toMatch(/\.eq\('edit_version', expectedVersion\)/i);
    expect(page).toMatch(/sync_employee_roles_if_unchanged/i);
    expect(page).toMatch(/_expected_version:\s*updatedFunc\.edit_version/i);
    expect(page).toMatch(/Outra pessoa alterou esta ficha/i);
  });
});
