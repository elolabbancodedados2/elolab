import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261011140000_retornos_integridade_tenant.sql',
  'utf8',
);
const agendaMigration = readFileSync(
  'supabase/migrations/20261011070000_retornos_perfil_medico_e_agenda.sql',
  'utf8',
);
const page = readFileSync('src/pages/Retornos.tsx', 'utf8');

describe('integridade tenant dos retornos', () => {
  it('valida paciente, médico e agendamentos vinculados na mesma clínica', () => {
    expect(migration).toMatch(/FUNCTION public\.validar_referencias_retorno[\s\S]*?SECURITY DEFINER/i);
    expect(migration).toMatch(/FROM public\.pacientes[\s\S]*?id = NEW\.paciente_id[\s\S]*?clinica_id = NEW\.clinica_id/i);
    expect(migration).toMatch(/FROM public\.medicos[\s\S]*?id = NEW\.medico_id[\s\S]*?clinica_id = NEW\.clinica_id/i);
    expect(migration).toMatch(/NEW\.agendamento_id[\s\S]*?paciente_id = NEW\.paciente_id[\s\S]*?clinica_id = NEW\.clinica_id/i);
    expect(migration).toMatch(/NEW\.agendamento_retorno_id[\s\S]*?paciente_id = NEW\.paciente_id[\s\S]*?medico_id = NEW\.medico_id[\s\S]*?clinica_id = NEW\.clinica_id/i);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF[\s\S]*?ON public\.retornos/i);
  });

  it('só cancela ou remarca um agendamento antes do início do atendimento', () => {
    expect(migration).toMatch(/FUNCTION public\.cancelar_retorno_atomico[\s\S]*?FOR UPDATE[\s\S]*?v_status_agendamento NOT IN \(\s*'agendado'[\s\S]*?'em_triagem'/i);
    expect(agendaMigration).toMatch(/FUNCTION public\.agendar_retorno_atomico[\s\S]*?FOR UPDATE[\s\S]*?v_status_agendamento NOT IN \(\s*'agendado'[\s\S]*?'aguardando_triagem'/i);
    expect(migration).toMatch(/FUNCTION public\.marcar_retorno_realizado_atomico[\s\S]*?now\(\) AT TIME ZONE 'America\/Sao_Paulo'/i);
  });

  it('usa a operação atômica do banco ao confirmar comparecimento', () => {
    expect(page).toMatch(/rpc\('marcar_retorno_realizado_atomico'[\s\S]*?p_retorno_id: retorno\.id/);
  });
});
