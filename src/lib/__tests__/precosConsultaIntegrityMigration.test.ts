import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261011330000_precos_consulta_tenant_integrity.sql';

describe('integridade dos preços de consulta', () => {
  it('impede valores inválidos e referências a tipos ou convênios de outra clínica', () => {
    const migration = readFileSync(path, 'utf8');

    expect(migration).toMatch(/CHECK\s*\(valor\s*>=\s*0\s+AND\s+valor\s*=\s*round\(valor,\s*2\)\)\s+NOT VALID/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.validar_preco_consulta_clinica/i);
    expect(migration).toMatch(/NEW\.clinica_id IS NULL/i);
    expect(migration).toMatch(/public\.tipos_consulta[\s\S]*clinica_id = NEW\.clinica_id/i);
    expect(migration).toMatch(/public\.convenios[\s\S]*clinica_id = NEW\.clinica_id/i);
    expect(migration).toMatch(/CREATE TRIGGER precos_consulta_validar_referencias/i);
    expect(migration).toMatch(/DROP POLICY IF EXISTS precos_consulta_insert ON public\.precos_consulta_convenio/i);
    expect(migration).toMatch(/clinica_id = public\.get_my_clinica_id\(\)/i);
    expect(migration).toMatch(/precos_exames_convenio_valores_validos[\s\S]*valor_tabela\s*>\s*0[\s\S]*valor_filme[\s\S]*valor_custo[\s\S]*valor_repasse[\s\S]*NOT VALID/i);
  });
});
