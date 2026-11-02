import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261102206000_compra_recebida_atualiza_custo.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('recebimento de pedido de compra', () => {
  it('grava o preço do pedido como custo unitário do estoque, sem criar conta a pagar', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.receber_pedido_compra\(p_pedido_id uuid\)/);
    expect(migration).toMatch(/SELECT i\.id, i\.estoque_id, i\.quantidade, i\.preco_unitario/);
    expect(migration).toMatch(/IF v_item\.preco_unitario > 0 THEN\s+UPDATE public\.estoque SET valor_unitario = v_item\.preco_unitario\s+WHERE id = v_item\.estoque_id AND clinica_id = v_clinica_id;/);
    expect(migration).not.toMatch(/INSERT INTO public\.lancamentos/);
  });
});
