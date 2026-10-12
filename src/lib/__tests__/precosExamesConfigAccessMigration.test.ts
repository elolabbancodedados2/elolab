import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261011420000_precos_exames_config_access.sql';

describe('acesso à tabela de preços particular', () => {
  it('restringe escrita dos preços de exames aos perfis admin e financeiro', () => {
    const migration = readFileSync(path, 'utf8');

    expect(migration).toMatch(/DROP POLICY IF EXISTS config_insert ON public\.configuracoes_clinica/i);
    expect(migration).toMatch(/CREATE POLICY config_insert[\s\S]*precos_exames_internos[\s\S]*can_access_financial\(auth\.uid\(\)\)/i);
    expect(migration).toMatch(/DROP POLICY IF EXISTS config_update ON public\.configuracoes_clinica/i);
    expect(migration).toMatch(/CREATE POLICY config_update[\s\S]*precos_exames_internos[\s\S]*can_access_financial\(auth\.uid\(\)\)/i);
    expect(migration).toMatch(/is_same_clinica\(clinica_id\)/i);
  });
});
