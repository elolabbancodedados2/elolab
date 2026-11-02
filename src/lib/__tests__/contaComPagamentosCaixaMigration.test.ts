import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261102202000_conta_com_pagamentos_usa_caixa_do_pagamento.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('conta paga em partes em dias diferentes', () => {
  it('não confere o caixa da conta quando ela tem linhas em pagamentos', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.exigir_caixa_aberto_para_lancamento\(\)/);
    expect(migration).toMatch(/IF TG_OP = 'UPDATE'\s+AND OLD\.tipo IS NOT DISTINCT FROM NEW\.tipo\s+AND OLD\.clinica_id IS NOT DISTINCT FROM NEW\.clinica_id\s+AND EXISTS \(SELECT 1 FROM public\.pagamentos p WHERE p\.lancamento_id = NEW\.id\) THEN\s+RETURN NEW;/);
    // Lançamentos sem pagamentos (sangria, despesa do caixa, legados) seguem conferidos.
    expect(migration).toMatch(/RAISE EXCEPTION 'Caixa de % fechado ou inexistente\.'/);
  });
});
