import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261011050000_fila_triagem_perfis_e_privacidade.sql',
  'utf8',
);
const filaSource = readFileSync('src/pages/Fila.tsx', 'utf8');
const integridadeMigration = readFileSync(
  'supabase/migrations/20261011120000_triagem_tenant_e_autoria.sql',
  'utf8',
);

describe('privacidade e permissao dos fluxos de fila e triagem', () => {
  it('limita leitura de triagens aos perfis clinicos', () => {
    const triagensPolicy = migration.split('DROP POLICY IF EXISTS fila_atendimento_insert')[0];
    expect(triagensPolicy).toMatch(/CREATE POLICY triagens_select_scoped[\s\S]*?can_access_clinical\(auth\.uid\(\)\)[\s\S]*?is_same_clinica\(clinica_id\)/i);
    expect(triagensPolicy).not.toMatch(/is_recepcao\(auth\.uid\(\)\)/i);
  });

  it('permite check-in de perfis que a tela da fila aceita', () => {
    expect(migration).toMatch(/REVOKE INSERT ON public\.fila_atendimento FROM authenticated/i);
    expect(migration).toMatch(/FUNCTION public\.realizar_checkin[\s\S]*?SECURITY DEFINER[\s\S]*?is_medico_da_agenda\(v_agendamento\.medico_id\)/i);
    expect(migration).not.toMatch(/CREATE POLICY fila_atendimento_insert/i);
  });

  it('expõe somente os ids de consultas triadas e restringe a RPC a perfis autorizados', () => {
    expect(migration).toMatch(/FUNCTION public\.listar_agendamentos_com_triagem[\s\S]*?RETURNS TABLE \(agendamento_id uuid\)/i);
    expect(migration).toMatch(/is_recepcao\(auth\.uid\(\)\)[\s\S]*?RAISE EXCEPTION/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.listar_agendamentos_com_triagem\(uuid\[\]\) FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.listar_agendamentos_com_triagem\(uuid\[\]\) TO authenticated/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.tem_triagem\(uuid\) FROM PUBLIC, anon, authenticated/i);
    expect(filaSource).toContain("rpc('listar_agendamentos_com_triagem'");
    expect(filaSource).not.toMatch(/from\('triagens'\)/i);
  });

  it('validates triage tenant references and author in the database', () => {
    expect(integridadeMigration).toMatch(/FUNCTION public\.validar_referencias_triagem[\s\S]*?SECURITY DEFINER/i);
    expect(integridadeMigration).toMatch(/paciente_clinica_id IS DISTINCT FROM NEW\.clinica_id/i);
    expect(integridadeMigration).toMatch(/agendamento_clinica_id IS DISTINCT FROM NEW\.clinica_id/i);
    expect(integridadeMigration).toMatch(/agendamento_paciente_id IS DISTINCT FROM NEW\.paciente_id/i);
    expect(integridadeMigration).toMatch(/NEW\.enfermeiro_id IS DISTINCT FROM auth\.uid\(\)/i);
    expect(integridadeMigration).toMatch(/BEFORE INSERT OR UPDATE OF paciente_id, agendamento_id, clinica_id, enfermeiro_id/i);
    expect(integridadeMigration).toMatch(/FROM public\.pacientes p[\s\S]*?FOR SHARE/i);
    expect(integridadeMigration).toMatch(/FROM public\.agendamentos a[\s\S]*?FOR SHARE/i);
  });});
