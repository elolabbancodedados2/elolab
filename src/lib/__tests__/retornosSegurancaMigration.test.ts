import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261011070000_retornos_perfil_medico_e_agenda.sql',
  'utf8',
);

describe('escopo de retornos e agenda para medicos', () => {
  it('isola retornos e confirma conflito, bloqueio e expediente no banco', () => {
    expect(migration).toMatch(/CREATE POLICY retornos_select_scoped[\s\S]*?is_medico_da_agenda\(medico_id\)/i);
    expect(migration).toMatch(/CREATE POLICY retornos_update_scoped[\s\S]*?is_medico_da_agenda\(medico_id\)/i);
    expect(migration).toMatch(/FUNCTION public\.agendar_retorno_atomico[\s\S]*?SECURITY DEFINER/i);
    expect(migration).toMatch(/p_confirmou_fora_expediente boolean/);
    expect(migration).toMatch(/O horario do retorno nao pode estar no passado/);
    expect(migration).toMatch(/bloqueios_agenda/);
    expect(migration).toMatch(/medico_disponibilidade/);
    expect(migration).toMatch(/a\.paciente_id = v_retorno\.paciente_id/);    expect(migration).toMatch(/agendamento-online-medico:/);
    expect(migration).toMatch(/agendamento-online-paciente:/);
    expect(migration).toMatch(/UPDATE public\.agendamentos[\s\S]*?paciente_id = v_retorno\.paciente_id[\s\S]*?medico_id = v_retorno\.medico_id/);
  });
});
