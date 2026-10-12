import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261011060000_gestao_salas_recepcao.sql',
  'utf8',
);
const referenciasMigration = readFileSync(
  'supabase/migrations/20261011130000_integridade_salas_lista_espera.sql',
  'utf8',
);

describe('permissao de operacao das salas', () => {
  it('libera criacao e atualizacao somente para admin/recepcao da mesma clinica', () => {
    expect(migration).toMatch(/CREATE POLICY salas_insert[\s\S]*?public\.is_same_clinica\(clinica_id\)/i);
    expect(migration).toMatch(/CREATE POLICY salas_update[\s\S]*?USING[\s\S]*?public\.is_same_clinica\(clinica_id\)/i);
    expect(migration).toMatch(/public\.is_admin\(auth\.uid\(\)\)[\s\S]*?OR public\.is_recepcao\(auth\.uid\(\)\)/i);
    expect(migration).not.toMatch(/CREATE POLICY salas_delete/i);
  });

  it('validates room doctor and wait-list patient and doctor tenants', () => {
    expect(referenciasMigration).toMatch(/FUNCTION public\.validar_medico_responsavel_sala[\s\S]*?medico_clinica_id IS DISTINCT FROM NEW\.clinica_id/i);
    expect(referenciasMigration).toMatch(/FUNCTION public\.validar_referencias_lista_espera[\s\S]*?paciente_clinica_id IS DISTINCT FROM NEW\.clinica_id/i);
    expect(referenciasMigration).toMatch(/medico_clinica_id IS DISTINCT FROM NEW\.clinica_id/i);
    expect(referenciasMigration).toMatch(/FOR SHARE/i);
    expect(referenciasMigration).toMatch(/FUNCTION public\.convocar_lista_espera_apos_cancelamento[\s\S]*?JOIN public\.pacientes p ON p\.id = le\.paciente_id AND p\.clinica_id = le\.clinica_id/i);
    expect(referenciasMigration).toMatch(/WHERE p\.id = candidato\.paciente_id AND p\.clinica_id = NEW\.clinica_id/i);
  });
});
