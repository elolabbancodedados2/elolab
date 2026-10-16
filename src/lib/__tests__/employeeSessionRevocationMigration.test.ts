import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261014110000_revogar_sessoes_ao_inativar_funcionario.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const sessionRevocation = readFileSync('supabase/migrations/20260801161000_encerrar_sessoes.sql', 'utf8');

describe('revogação de sessões ao inativar funcionário', () => {
  it('redefine a RPC transacional que sincroniza estado e papéis', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.sync_employee_roles\([\s\S]*?_ativo boolean[\s\S]*?\)/i);
    expect(migration).toMatch(/SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.sync_employee_roles\(uuid, uuid, public\.app_role\[\], boolean\) FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.sync_employee_roles\(uuid, uuid, public\.app_role\[\], boolean\) TO authenticated/i);
  });

  it('encerra sessões e refresh tokens somente quando o funcionário fica inativo', () => {
    const fn = migration.split('CREATE OR REPLACE FUNCTION public.sync_employee_roles(')[1] ?? '';
    expect(fn).toMatch(/DELETE FROM public\.user_roles WHERE user_id = v_user_id;[\s\S]*?IF _ativo THEN[\s\S]*?INSERT INTO public\.user_roles/i);
    expect(fn).toMatch(/ELSE[\s\S]*?PERFORM public\.admin_encerrar_sessoes\(v_user_id\);[\s\S]*?END IF;/i);
    expect(fn).not.toMatch(/admin_encerrar_sessoes\(_user_id\)/i);
  });

  it('mantém a revogação global inacessível diretamente pelo cliente', () => {
    expect(sessionRevocation).toMatch(/REVOKE ALL ON FUNCTION public\.admin_encerrar_sessoes\(uuid\) FROM PUBLIC/i);
    expect(sessionRevocation).toMatch(/REVOKE ALL ON FUNCTION public\.admin_encerrar_sessoes\(uuid\) FROM authenticated/i);
    expect(sessionRevocation).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_encerrar_sessoes\(uuid\) TO service_role/i);
    expect(sessionRevocation).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_encerrar_sessoes\(uuid\) TO authenticated/i);
  });

  it('limita alterações ao funcionário vinculado à clínica do administrador autenticado', () => {
    expect(migration).toMatch(/v_clinica_id uuid := public\.get_my_clinica_id\(\)/i);
    expect(migration).toMatch(/public\.is_admin\(auth\.uid\(\)\)/i);
    expect(migration).toMatch(/f\.id = _funcionario_id AND f\.clinica_id = v_clinica_id/i);
    expect(migration).toMatch(/p\.clinica_id = v_clinica_id/i);
  });
});
