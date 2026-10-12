import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261011040000_caixa_select_por_perfil.sql',
  'utf8',
);

describe('acesso de leitura ao caixa no banco', () => {
  it('restringe a leitura aos perfis da tela e mantém o isolamento por clínica', () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS caixa_diario_select_scoped ON public\.caixa_diario/i);
    expect(migration).toMatch(/CREATE POLICY caixa_diario_select_scoped[\s\S]*?FOR SELECT\s+TO authenticated/i);
    expect(migration).toMatch(/public\.is_same_clinica\(clinica_id\)/i);
    expect(migration).toMatch(/public\.is_admin\(auth\.uid\(\)\)[\s\S]*?OR public\.is_financeiro\(auth\.uid\(\)\)[\s\S]*?OR public\.is_recepcao\(auth\.uid\(\)\)/i);
    expect(migration).not.toMatch(/has_any_role\(auth\.uid\(\)\)/i);
  });
});
