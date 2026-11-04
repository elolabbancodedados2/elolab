import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261103200000_cid10_carga_datasus.sql', 'utf8');

describe('carga do CID-10', () => {
  it('traz o catálogo completo e é idempotente', () => {
    const linhas = sql.match(/^\('/gm) ?? [];
    expect(linhas.length).toBeGreaterThan(10_000);
    expect(sql).toContain('ON CONFLICT (codigo) DO NOTHING');
  });

  it('usa o formato de código com ponto e mantém os acentos', () => {
    expect(sql).toContain("('J06.9',");
    expect(sql).toMatch(/\('J03\.9','Amigdalite aguda não especificada'/);
    expect(sql).not.toContain('Ã');
  });
});
