export interface WaitingListPreferences {
  medico_id?: string | null;
  especialidade?: string | null;
  preferencia_horario?: string | null;
}

export interface WaitingListSlot {
  medico_id: string;
  hora_inicio: string;
}

export interface WaitingListDoctor {
  id: string;
  especialidade?: string | null;
}

export interface WaitingListAppointmentDraft {
  paciente_id: string;
  medico_id: string;
  data: string;
  hora_inicio: string;
  tipo: 'consulta';
  status: 'agendado';
  observacoes: string;
  _waiting_id: string;
  _waiting_status: string;
}

const normalizar = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

/**
 * O profissional atende a especialidade pedida? Sem acento e sem caixa, e o
 * cadastro pode listar v\u00e1rias ("Cardiologia / Cl\u00ednica M\u00e9dica").
 */
export function especialidadeAtende(especialidadeMedico: string | null | undefined, pedida: string | null | undefined): boolean {
  if (!pedida?.trim()) return true;
  if (!especialidadeMedico?.trim()) return false;
  const alvo = normalizar(pedida);
  return especialidadeMedico.split(/[,;/|]| e /).map(normalizar).filter(Boolean).some(item => item === alvo);
}

/** Especialidades dos profissionais ativos, sem repetir varia\u00e7\u00f5es de acento ou caixa. */
export function especialidadesCadastradas(medicos: Array<{ especialidade?: string | null; ativo?: boolean | null }>): string[] {
  const vistas = new Map<string, string>();
  for (const medico of medicos) {
    if (medico.ativo === false || !medico.especialidade) continue;
    for (const item of medico.especialidade.split(/[,;/|]/).map(parte => parte.trim()).filter(Boolean)) {
      const chave = normalizar(item);
      if (!vistas.has(chave)) vistas.set(chave, item);
    }
  }
  return [...vistas.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function minutos(value: string): number | null {
  const match = /^(?:([01]\d|2[0-3])):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function validateWaitingListSlot(
  waiting: WaitingListPreferences,
  slot: WaitingListSlot,
  doctors: WaitingListDoctor[],
): string | null {
  if (waiting.medico_id && waiting.medico_id !== slot.medico_id) {
    return 'Esta pessoa aguarda pelo médico preferencial. Escolha uma vaga com esse profissional.';
  }

  const doctor = doctors.find((item) => item.id === slot.medico_id);
  if (!doctor) return 'Não foi possível confirmar o profissional da vaga.';
  if (waiting.especialidade && !especialidadeAtende(doctor.especialidade, waiting.especialidade)) {
    return 'O profissional desta vaga não corresponde à especialidade solicitada.';
  }

  const preference = normalizar(waiting.preferencia_horario || '');
  if (!preference) return null;
  const start = minutos(slot.hora_inicio);
  if (start === null) return 'O horário da vaga não é válido.';
  const bounds: Record<string, { start: number; end: number; label: string }> = {
    manha: { start: 6 * 60, end: 12 * 60, label: 'manhã' },
    tarde: { start: 12 * 60, end: 18 * 60, label: 'tarde' },
    noite: { start: 18 * 60, end: 24 * 60, label: 'noite' },
  };
  const wanted = bounds[preference];
  if (!wanted) return null;
  return start >= wanted.start && start < wanted.end
    ? null
    : `Esta vaga está fora do período da ${wanted.label} indicado pela pessoa.`;
}

export function prepareWaitingListAppointment(
  waiting: WaitingListPreferences & {
    id: string;
    paciente_id: string;
    status?: string | null;
    motivo?: string | null;
    observacoes?: string | null;
  },
  slot: WaitingListSlot & { data: string },
  doctors: WaitingListDoctor[],
): { error: string; appointment: null } | { error: null; appointment: WaitingListAppointmentDraft } {
  const error = validateWaitingListSlot(waiting, slot, doctors);
  if (error) return { error, appointment: null };

  const observacoes = [
    waiting.motivo ? `Motivo informado na lista de espera: ${waiting.motivo}` : null,
    waiting.observacoes ? `Observações da lista de espera: ${waiting.observacoes}` : null,
    waiting.especialidade ? `Especialidade solicitada: ${waiting.especialidade}` : null,
    waiting.preferencia_horario ? `Período preferido: ${waiting.preferencia_horario}` : null,
  ].filter(Boolean).join('\n');

  return {
    error: null,
    appointment: {
      paciente_id: waiting.paciente_id,
      medico_id: slot.medico_id,
      data: slot.data,
      hora_inicio: slot.hora_inicio,
      tipo: 'consulta',
      status: 'agendado',
      observacoes,
      _waiting_id: waiting.id,
      _waiting_status: waiting.status || 'aguardando',
    },
  };
}
