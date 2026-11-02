import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261102201000_point_pagamento_na_data_do_registro.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('pagamento Point pendente de caixa', () => {
  it('grava o pagamento com a data do registro e guarda a aprovação nas observações', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.registrar_pagamento_mercadopago_point\(p_point_order_id uuid\)/);
    expect(migration).toMatch(/v_order\.valor, 1,\s*now\(\), v_order\.created_by/);
    expect(migration).not.toMatch(/coalesce\(v_order\.paid_at, now\(\)\), v_order\.created_by/);
    expect(migration).toMatch(/Aprovado no terminal em/);
    expect(migration).toMatch(/payment_sync_status = 'pendente_caixa'/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.registrar_pagamento_mercadopago_point\(uuid\) TO service_role/);
  });
});
