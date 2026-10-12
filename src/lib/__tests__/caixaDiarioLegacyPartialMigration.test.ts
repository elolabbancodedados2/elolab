import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261011410000_caixa_diario_pagamentos_parciais_legados.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('movimentos legados do Caixa Diário', () => {
  it('inclui o valor recebido de lançamentos parciais antigos sem duplicar pagamentos detalhados', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.movimentos_caixa_diario\(p_data date\)/i);
    expect(migration).toMatch(/l\.status\s+IN\s*\('pago',\s*'parcial'\)/i);
    expect(migration).toMatch(/CASE\s+WHEN\s+l\.status\s*=\s*'parcial'\s+THEN\s+COALESCE\(l\.valor_pago,\s*0\)/i);
    expect(migration).toMatch(/NOT EXISTS\s*\([\s\S]*FROM public\.pagamentos p WHERE p\.lancamento_id = l\.id/i);
    expect(migration).toMatch(/l\.clinica_id\s*=\s*public\.get_my_clinica_id\(\)/i);
  });
});
