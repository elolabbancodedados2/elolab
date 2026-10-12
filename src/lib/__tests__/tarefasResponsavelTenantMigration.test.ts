import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261011110000_tarefas_responsavel_mesma_clinica.sql',
  'utf8',
);

describe('integridade do responsável da tarefa', () => {
  it('rejeita perfis ausentes ou pertencentes a outra clínica', () => {
    expect(migration).toMatch(/FUNCTION public\.validar_responsavel_da_tarefa[\s\S]*?SECURITY DEFINER/i);
    expect(migration).toMatch(/FROM public\.profiles p[\s\S]*?p\.id = NEW\.responsavel_id/i);
    expect(migration).toMatch(/responsavel_clinica_id IS DISTINCT FROM NEW\.clinica_id/i);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF responsavel_id, clinica_id/i);
  });
});
