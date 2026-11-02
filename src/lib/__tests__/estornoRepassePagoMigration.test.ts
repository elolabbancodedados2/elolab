import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261102204000_estorno_exige_repasse_nao_pago.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('estorno de pagamento com repasse médico pago', () => {
  it('recusa o estorno antes de marcar o pagamento', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.estornar_pagamento\(\s*p_pagamento_id uuid,\s*p_motivo\s+text\s*\)/);
    expect(migration).toMatch(/FROM public\.repasses_medicos r\s+WHERE r\.lancamento_id = v_pag\.lancamento_id AND r\.status = 'pago'/);
    expect(migration).toMatch(/repasse médico desta conta já foi pago/);
    expect(migration.indexOf('repasses_medicos')).toBeLessThan(migration.indexOf('SET estornado_em = now()'));
  });
});
