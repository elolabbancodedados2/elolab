import { describe, expect, it } from 'vitest';
import { APPOINTMENT_CANCELLATION_REASONS, isAppointmentCancellationReason } from './appointmentCancellation';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

describe('appointment cancellation reason', () => {
  it('offers a small, non-clinical set of structured reasons', () => {
    expect(APPOINTMENT_CANCELLATION_REASONS.map(({ value }) => value)).toEqual([
      'solicitacao_paciente', 'indisponibilidade_profissional', 'conflito_horario', 'ajuste_administrativo', 'outro',
    ]);
  });

  it('rejects blank and unknown reasons', () => {
    expect(isAppointmentCancellationReason('')).toBe(false);
    expect(isAppointmentCancellationReason('motivo clínico detalhado')).toBe(false);
    expect(isAppointmentCancellationReason('conflito_horario')).toBe(true);
  });

  it('sends the selected reason through both agenda cancellation flows', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'components', 'agenda');
    // As ações do cartão (menu, "⋯" e folha do celular) ficam em useAcoesConsulta.
    const card = readFileSync(resolve(root, 'useAcoesConsulta.tsx'), 'utf8');
    const dialog = readFileSync(resolve(root, 'AppointmentDialog.tsx'), 'utf8');
    expect(card).toMatch(/p_motivo_cancelamento:\s*motivoCancelamento/);
    expect(dialog).toMatch(/p_motivo_cancelamento:\s*motivoCancelamento/);
    expect(card).toMatch(/isAppointmentCancellationReason\(motivoCancelamento\)/);
    expect(dialog).toMatch(/isAppointmentCancellationReason\(motivoCancelamento\)/);
  });

  it('checks tenant, permissions, status and allowed reason in the transactional RPC', () => {
    const migration = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations', '20261014100000_motivo_cancelamento_agendamento.sql'), 'utf8');
    expect(migration).toMatch(/public\.is_same_clinica\(p_clinica_id\)/);
    expect(migration).toMatch(/public\.can_manage_data\(auth\.uid\(\)\)/);
    expect(migration).toMatch(/FOR UPDATE/);
    expect(migration).toMatch(/p_motivo_cancelamento NOT IN/);
    expect(migration).toMatch(/motivo_cancelamento = p_motivo_cancelamento/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.cancelar_agendamento_com_motivo[^;]*FROM PUBLIC, anon/);
  });
});
