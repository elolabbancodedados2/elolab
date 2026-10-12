import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261011090000_pacientes_privacidade_financeira.sql',
  'utf8',
);

describe('privacidade financeira do cadastro de pacientes', () => {
  it('limita a tabela clinica e oferece somente dados basicos via RPC para financeiro', () => {
    expect(migration).toMatch(/CREATE POLICY pacientes_select_clinico[\s\S]*?is_medico\(auth\.uid\(\)\)/i);
    expect(migration).toMatch(/FUNCTION public\.buscar_pacientes_resumo_financeiro[\s\S]*?SECURITY DEFINER/i);
    const resumoFinanceiro = migration.split('CREATE OR REPLACE FUNCTION public.resumo_pacientes_clinica')[0];
    expect(resumoFinanceiro).toMatch(/p_ids IS NULL OR p\.id = ANY\(p_ids\)/i);
    expect(migration).toMatch(/is_financeiro\(auth\.uid\(\)\)/i);
    expect(resumoFinanceiro).not.toMatch(/alergias|observacoes|gestante|comorbidades/i);
    expect(resumoFinanceiro).toMatch(/LEAST\(COALESCE\(p_limite, 20\), 500\)/i);
    const resumoClinico = migration.split('CREATE OR REPLACE FUNCTION public.resumo_pacientes_clinica')[1]?.split('$$;')[0] ?? '';
    expect(resumoClinico).not.toMatch(/is_financeiro\(auth\.uid\(\)\)/i);
  });

  it('nao permite inserir paciente sem a clinica ativa', () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS pacientes_insert ON public\.pacientes/i);
    expect(migration).toMatch(/CREATE POLICY pacientes_insert[\s\S]*?WITH CHECK[\s\S]*?clinica_id = public\.get_my_clinica_id\(\)/i);
    expect(migration).not.toMatch(/clinica_id = public\.get_my_clinica_id\(\)\s+OR\s+clinica_id IS NULL/i);
  });
});
