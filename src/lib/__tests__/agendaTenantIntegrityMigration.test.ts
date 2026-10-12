import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20261011260000_agenda_integridade_referencial_e_status.sql';
const migration = existsSync(path) ? readFileSync(path, 'utf8') : '';
const rescheduleGuardPath = 'supabase/migrations/20261011450000_agendamento_bloqueia_remarcacao_em_andamento.sql';
const rescheduleGuard = existsSync(rescheduleGuardPath) ? readFileSync(rescheduleGuardPath, 'utf8') : '';

describe('integridade da agenda no banco', () => {
  it('valida que paciente, profissional e sala pertencem à clínica do agendamento', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.validar_referencias_agendamento/i);
    expect(migration).toMatch(/public\.pacientes[\s\S]*clinica_id/i);
    expect(migration).toMatch(/public\.medicos[\s\S]*clinica_id/i);
    expect(migration).toMatch(/public\.salas[\s\S]*clinica_id/i);
    expect(migration).toMatch(/CREATE TRIGGER agendamentos_validar_referencias/i);
  });

  it('valida transições de status em qualquer atualização direta ou RPC', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.validar_transicao_status_agendamento/i);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF status ON public\.agendamentos/i);
    expect(migration).toMatch(/RAISE EXCEPTION[\s\S]*transi/i);
  });

  it('serializa consultas e bloqueios do mesmo profissional e recusa sobreposição', () => {
    expect(migration).toMatch(/CREATE TRIGGER agendamentos_nao_sobrepoe_bloqueio/i);
    expect(migration).toMatch(/CREATE TRIGGER bloqueios_agenda_sem_conflito/i);
    expect(migration).toMatch(/pg_advisory_xact_lock[\s\S]*AGENDA_BLOQUEIO_CONFLITO/i);
  });

  it('blocks database rescheduling after an appointment has advanced', () => {
    expect(rescheduleGuard).toMatch(/BEFORE UPDATE OF data, hora_inicio, hora_fim, medico_id, sala_id ON public\.agendamentos/i);
    expect(rescheduleGuard).toMatch(/OLD\.status::text NOT IN \('agendado', 'confirmado', 'aguardando'\)/i);
    expect(rescheduleGuard).toMatch(/RAISE EXCEPTION[\s\S]*remarca/i);
  });
});
