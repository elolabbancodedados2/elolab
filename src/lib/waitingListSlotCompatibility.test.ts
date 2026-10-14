import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { prepareWaitingListAppointment, validateWaitingListSlot } from './waitingListSlotCompatibility';

const waiting = {
  medico_id: 'doctor-1',
  especialidade: 'Cardiologia',
  preferencia_horario: 'manha',
};

describe('validateWaitingListSlot', () => {
  it('permite encaixe que mantém médico, especialidade e horário preferidos', () => {
    expect(validateWaitingListSlot(waiting, { medico_id: 'doctor-1', hora_inicio: '10:30' }, [
      { id: 'doctor-1', especialidade: 'Cardiologia' },
    ])).toBeNull();
  });

  it('bloqueia vaga de outro médico quando há preferência definida', () => {
    expect(validateWaitingListSlot(waiting, { medico_id: 'doctor-2', hora_inicio: '10:30' }, [
      { id: 'doctor-1', especialidade: 'Cardiologia' },
      { id: 'doctor-2', especialidade: 'Cardiologia' },
    ])).toMatch(/médico preferencial/);
  });

  it('bloqueia vaga de especialidade diferente', () => {
    expect(validateWaitingListSlot({ ...waiting, medico_id: null }, { medico_id: 'doctor-2', hora_inicio: '10:30' }, [
      { id: 'doctor-2', especialidade: 'Neurologia' },
    ])).toMatch(/especialidade solicitada/);
  });

  it('bloqueia vaga fora do período preferido', () => {
    expect(validateWaitingListSlot(waiting, { medico_id: 'doctor-1', hora_inicio: '15:00' }, [
      { id: 'doctor-1', especialidade: 'Cardiologia' },
    ])).toMatch(/período da manhã/);
  });

  it('não restringe horário quando a pessoa aceitou qualquer período', () => {
    expect(validateWaitingListSlot({ ...waiting, preferencia_horario: null }, { medico_id: 'doctor-1', hora_inicio: '15:00' }, [
      { id: 'doctor-1', especialidade: 'Cardiologia' },
    ])).toBeNull();
  });

  it('prepara o encaixe com paciente, profissional, data, horário e contexto para confirmação', () => {
    const result = prepareWaitingListAppointment({
      id: 'waiting-1', paciente_id: 'patient-1', status: 'aguardando', ...waiting,
      motivo: 'Retorno solicitado', observacoes: 'Pode atender após as 9h.',
    }, { medico_id: 'doctor-1', data: '2030-06-03', hora_inicio: '10:30' }, [
      { id: 'doctor-1', especialidade: 'Cardiologia' },
    ]);

    expect(result.error).toBeNull();
    expect(result.appointment).toMatchObject({
      paciente_id: 'patient-1', medico_id: 'doctor-1', data: '2030-06-03', hora_inicio: '10:30',
      tipo: 'consulta', status: 'agendado', _waiting_id: 'waiting-1', _waiting_status: 'aguardando',
      observacoes: expect.stringContaining('Especialidade solicitada: Cardiologia'),
    });
    expect(result.appointment?.observacoes).toContain('Período preferido: manha');
  });
});

describe('integração do encaixe na Agenda', () => {
  it('valida o destino antes de abrir a confirmação com o rascunho preparado', () => {
    const source = readFileSync('src/components/agenda/AgendaPage.tsx', 'utf8');
    const branchStart = source.indexOf('if (active?.waiting)');
    const branchEnd = source.indexOf('if (active?.agendamento)', branchStart);
    const waitingBranch = source.slice(branchStart, branchEnd);

    expect(waitingBranch).toContain('prepareWaitingListAppointment');
    expect(waitingBranch).toContain('if (draft.error || !draft.appointment)');
    expect(waitingBranch).toContain('initial: draft.appointment');
  });
});
