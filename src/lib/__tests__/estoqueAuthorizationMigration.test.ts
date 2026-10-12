import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20261011200000_estoque_acesso_por_responsabilidade.sql';
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const cadastroSourceMigration = readFileSync('supabase/migrations/20261008430000_cadastro_estoque_idempotente.sql', 'utf8');
const estoqueUpdatePolicy = migration.match(/CREATE POLICY estoque_update[\s\S]*?;/i)?.[0] ?? '';
const estoqueInsertPolicy = migration.match(/CREATE POLICY estoque_insert[\s\S]*?;/i)?.[0] ?? '';
const movimentoInsertPolicy = migration.match(/CREATE POLICY movimentacoes_estoque_insert[\s\S]*?;/i)?.[0] ?? '';
const cadastroFunction = migration.match(/CREATE (?:OR REPLACE )?FUNCTION public\.cadastrar_item_estoque\([\s\S]*?\$\$;/i)?.[0] ?? '';
const movimentacaoFunction = migration.match(/CREATE (?:OR REPLACE )?FUNCTION public\.registrar_movimentacao_estoque\([\s\S]*?\$\$;/i)?.[0] ?? '';
const baixaFunction = migration.match(/CREATE OR REPLACE FUNCTION public\.registrar_baixa_estoque[\s\S]*?\$\$;/i)?.[0] ?? '';

describe('controle de acesso às movimentações de estoque', () => {
  it('limita ajustes manuais a administradores e enfermagem', () => {
    expect(estoqueUpdatePolicy).toContain('FOR UPDATE TO authenticated');
    expect(estoqueUpdatePolicy).toContain('public.is_admin(auth.uid())');
    expect(estoqueUpdatePolicy).toContain('public.is_enfermagem(auth.uid())');
    expect(movimentoInsertPolicy).toContain('FOR INSERT TO authenticated');
    expect(movimentoInsertPolicy).toContain('WITH CHECK (false)');
    expect(estoqueUpdatePolicy).not.toMatch(/is_financeiro\(auth\.uid\(\)\)|is_medico\(auth\.uid\(\)\)/i);
  });

  it('obriga cadastro e movimentação a passarem por RPCs com trilha de saldo', () => {
    expect(estoqueInsertPolicy).toContain('WITH CHECK (false)');
    expect(movimentoInsertPolicy).toContain('WITH CHECK (false)');
    expect(migration).toMatch(/REVOKE INSERT, UPDATE ON public\.estoque FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT UPDATE \([\s\S]*?\) ON public\.estoque TO authenticated/i);
    expect(migration).toMatch(/REVOKE INSERT ON public\.movimentacoes_estoque FROM PUBLIC, anon, authenticated/i);
    expect(cadastroFunction).toMatch(/SECURITY DEFINER/i);
    expect(movimentacaoFunction).toMatch(/SECURITY DEFINER/i);
    expect(movimentacaoFunction).toMatch(/public\.is_admin\(auth\.uid\(\)\)[\s\S]*?public\.is_enfermagem\(auth\.uid\(\)\)/i);
    expect(cadastroSourceMigration).toMatch(/Saldo de abertura/i);
    expect(migration).toMatch(/cadastrar_item_estoque_impl/i);
    expect(migration).toMatch(/registrar_movimentacao_estoque_impl/i);
  });

  it('valida o prontuário e o médico responsável antes da baixa clínica', () => {
    expect(baixaFunction).toMatch(/SECURITY DEFINER/i);
    expect(baixaFunction).toMatch(/p_prontuario_id IS NULL/i);
    expect(baixaFunction).toMatch(/v_prontuario_clinica_id IS DISTINCT FROM v_clinica_id/i);
    expect(baixaFunction).toMatch(/is_medico_responsavel_do_prontuario\(v_medico_id\)/i);
    expect(baixaFunction).toMatch(/e\.id = p_item_id[\s\S]*?e\.clinica_id = v_clinica_id[\s\S]*?FOR UPDATE/i);
    expect(baixaFunction).toMatch(/v_motivo, auth\.uid\(\)/i);
    expect(baixaFunction).toMatch(/sum\([\s\S]*?pr\.quantidade/i);
    expect(baixaFunction).toMatch(/v_quantidade_ja_baixada IS DISTINCT FROM p_quantidade/i);
    expect(baixaFunction).toContain("item.quantidade_normalizada ~ '^[0-9]*[1-9][0-9]*$'");
  });
});
