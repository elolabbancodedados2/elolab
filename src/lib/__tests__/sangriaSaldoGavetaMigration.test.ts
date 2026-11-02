import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261102207000_sangria_limitada_ao_saldo_da_gaveta.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('limite da sangria no banco', () => {
  it('trava o caixa e recusa sangria maior que o dinheiro da gaveta', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.exigir_caixa_aberto_para_lancamento\(\)/);
    expect(migration).toMatch(/v_sangria := v_new_movimento AND NEW\.tipo = 'sangria'/);
    expect(migration).toMatch(/SELECT c\.aberto, c\.valor_abertura INTO v_aberto, v_abertura[\s\S]*?FOR UPDATE;/);
    expect(migration).toMatch(/FROM public\.movimentos_caixa_diario\(v_alvo\.data\) m\s+WHERE m\.forma_pagamento = 'dinheiro' AND m\.id <> NEW\.id/);
    expect(migration).toMatch(/A sangria de % é maior que o dinheiro disponível na gaveta/);
  });

  it('mantém a regra da conta com pagamentos da migration anterior', () => {
    expect(migration).toMatch(/AND EXISTS \(SELECT 1 FROM public\.pagamentos p WHERE p\.lancamento_id = NEW\.id\) THEN\s+RETURN NEW;/);
  });
});
