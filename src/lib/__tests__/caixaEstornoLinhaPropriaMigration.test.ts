import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261102200000_caixa_estorno_em_linha_propria.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('estorno no Caixa Diário em linha própria', () => {
  it('mantém o recebimento no dia do pagamento e lança o estorno negativo no dia do estorno', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.movimentos_caixa_diario\(p_data date\)/i);
    expect(migration).toMatch(/\(p\.data_pagamento AT TIME ZONE 'America\/Sao_Paulo'\)::date = p_data/);
    expect(migration).toMatch(/md5\(p\.id::text \|\| ':estorno'\)::uuid/);
    expect(migration).toMatch(/'Estorno: ' \|\| l\.descricao,\s*-p\.valor/);
    expect(migration).toMatch(/p\.estornado_em IS NOT NULL\s+AND \(p\.estornado_em AT TIME ZONE 'America\/Sao_Paulo'\)::date = p_data/);
    expect(migration).not.toMatch(/COALESCE\(p\.estornado_em, p\.data_pagamento\)/);
  });
});
