import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261102205000_guia_tiss_em_um_lote_so.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('guia TISS em mais de um lote', () => {
  it('aponta erro quando a guia já está em outro lote ativo do mesmo convênio', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.pendencias_lote_tiss\(p_lote_id uuid\)/);
    expect(migration).toMatch(/o\.clinica_id = g\.clinica_id AND o\.lote_id <> g\.lote_id/);
    expect(migration).toMatch(/btrim\(o\.numero_guia\) = btrim\(g\.numero_guia\)/);
    expect(migration).toMatch(/ol\.status NOT IN \('cancelado', 'rejeitado'\)/);
    expect(migration).toMatch(/'numero_guia', 'Esta guia já está em outro lote do mesmo convênio\.', 'erro', 'consistencia'/);
  });
});
