import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const path = 'supabase/migrations/20261011400000_tarefas_integridade_tenant.sql';
const migration = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('integridade de tenant nas tarefas', () => {
  it('exige clínica e autor autenticado ao criar tarefa', () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS "tarefas_insert_v2"/i);
    expect(migration).toMatch(/CREATE POLICY "tarefas_insert_tenant"[\s\S]*?WITH CHECK \([\s\S]*?clinica_id = public\.get_my_clinica_id\(\)[\s\S]*?criado_por = auth\.uid\(\)/i);
  });

  it('impede reatribuição do autor para tomar posse de tarefa de outra pessoa', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.impedir_alteracao_autoria_tarefa/i);
    expect(migration).toMatch(/NEW\.criado_por IS DISTINCT FROM OLD\.criado_por/i);
    expect(migration).toMatch(/BEFORE UPDATE OF criado_por ON public\.tarefas/i);
  });
});
