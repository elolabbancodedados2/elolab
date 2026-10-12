import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('migration de gravações controladas do TISS', () => {
  it('remove INSERT/UPDATE diretos e expõe apenas operações validadas', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261011090000_tiss_gravacoes_controladas.sql'), 'utf8');

    expect(migration).toMatch(/REVOKE\s+INSERT,\s*UPDATE\s+ON\s+public\.lotes_tiss\s+FROM\s+authenticated/i);
    expect(migration).toMatch(/REVOKE\s+UPDATE\s+ON\s+public\.glosas_convenio\s+FROM\s+authenticated/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.criar_lote_tiss/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.registrar_envio_lote_tiss/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.atualizar_glosa_convenio/i);
    expect(migration).toMatch(/can_access_financial\(auth\.uid\(\)\)/i);
    expect(migration).toMatch(/get_my_clinica_id\(\)/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.(criar_lote_tiss|registrar_envio_lote_tiss|atualizar_glosa_convenio)/i);
  });
});
