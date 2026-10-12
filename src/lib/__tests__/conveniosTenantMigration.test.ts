import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261011150000_convenios_integridade_tenant.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('integridade tenant da tabela de exames por convênio', () => {
  it('valida que o convênio vinculado pertence à mesma clínica do preço', () => {
    expect(/FUNCTION public\.validar_tenant_preco_exame_convenio\(\)[\s\S]*?SELECT c\.clinica_id[\s\S]*?NEW\.convenio_id[\s\S]*?IS DISTINCT FROM NEW\.clinica_id/i.test(migration)).toBe(true);
    expect(/CREATE TRIGGER trg_validar_preco_exame_tenant[\s\S]*?BEFORE INSERT OR UPDATE ON public\.precos_exames_convenio/i.test(migration)).toBe(true);
    expect(/FOR SHARE/i.test(migration)).toBe(true);
    expect(/FROM public\.precos_exames_convenio p[\s\S]*?JOIN public\.convenios c ON c\.id = p\.convenio_id[\s\S]*?p\.clinica_id IS DISTINCT FROM c\.clinica_id[\s\S]*?RAISE EXCEPTION/i.test(migration)).toBe(true);
  });

  it('exige que o preço esteja associado à clínica do usuário autenticado', () => {
    expect(/CREATE POLICY precos_exames_convenio_insert_scoped[\s\S]*?clinica_id = public\.get_my_clinica_id\(\)/i.test(migration)).toBe(true);
    expect(/CREATE POLICY precos_exames_convenio_insert_scoped[\s\S]*?clinica_id IS NULL/i.test(migration)).toBe(false);
    expect(/LOCK TABLE public\.precos_exames_convenio IN SHARE ROW EXCLUSIVE MODE/i.test(migration)).toBe(true);
  });
});
