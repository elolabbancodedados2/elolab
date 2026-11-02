import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rotuloCategoria } from '../dre';

const migrationPath = 'supabase/migrations/20261102203000_estorno_venda_como_deducao.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('estorno de venda do caixa na DRE', () => {
  it('liga a categoria estorno_venda à conta de deduções no plano padrão e nas clínicas existentes', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.criar_plano_contas_padrao\(\)/);
    expect(migration).toMatch(/\('despesa', 'estorno_venda', '2'\)/);
    expect(migration).toMatch(/c\.codigo = '2' AND c\.natureza = 'despesa' AND c\.grupo_dre = 'deducoes'\s+ON CONFLICT \(clinica_id, natureza, categoria\) DO NOTHING/);
  });

  it('mostra um rótulo legível para a categoria', () => {
    expect(rotuloCategoria('estorno_venda')).toBe('Estornos de vendas');
  });
});
