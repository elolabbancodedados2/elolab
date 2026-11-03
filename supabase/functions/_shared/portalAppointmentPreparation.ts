export interface PortalAppointmentForPreparation {
  data: string;
  tipo?: string | null;
  status?: string | null;
}

export interface ConsultationTypePreparation {
  nome: string;
  instrucoes_preparo?: string | null;
}

const STATUS_COM_PREPARO = new Set(['agendado', 'confirmado', 'aguardando']);
const normalizarTipo = (value: string | null | undefined) => String(value ?? '').trim().toLocaleLowerCase('pt-BR');

export function attachPortalPreparationInstructions<Appointment extends PortalAppointmentForPreparation>(
  appointments: readonly Appointment[],
  configuredTypes: readonly ConsultationTypePreparation[],
  today: string,
): Array<Appointment & { instrucoes_preparo: string | null }> {
  const instructionsByType = new Map(
    configuredTypes.map((type) => [normalizarTipo(type.nome), String(type.instrucoes_preparo ?? '').trim()]),
  );

  return appointments.map((appointment) => {
    const eligible = appointment.data >= today
      && STATUS_COM_PREPARO.has(String(appointment.status ?? '').toLocaleLowerCase('pt-BR'));
    const instructions = eligible ? instructionsByType.get(normalizarTipo(appointment.tipo)) : '';
    return { ...appointment, instrucoes_preparo: instructions || null };
  });
}
