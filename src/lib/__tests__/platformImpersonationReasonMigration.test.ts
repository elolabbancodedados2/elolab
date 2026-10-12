import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261011370000_impersonacao_exige_motivo.sql', 'utf8');

describe('motivo da impersonação da plataforma', () => {
  it('valida o administrador e o motivo no banco antes de alterar o perfil', () => {
    const roleCheck = migration.indexOf('IF NOT public.is_platform_admin()');
    const reasonCheck = migration.indexOf('length(v_motivo) NOT BETWEEN 5 AND 500');
    const profileChange = migration.indexOf('UPDATE public.profiles');
    expect(roleCheck).toBeGreaterThan(-1);
    expect(reasonCheck).toBeGreaterThan(roleCheck);
    expect(profileChange).toBeGreaterThan(reasonCheck);
    expect(migration).toContain('platform_admin_id, clinica_id, motivo, iniciado_em, acoes');
    expect(migration).toContain('auth.uid(), _target_clinica_id, v_motivo, now()');
  });
});
