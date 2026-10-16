type ConflictResource = 'médico' | 'paciente' | 'sala';

interface AppointmentConflictMessageInput {
  resource: ConflictResource;
  existingStart: string;
  existingEnd: string | null;
  requestedStart: string;
  requestedEnd: string;
}

function timeToMinutes(value: string): number | null {
  const match = /^(?:[01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  if (!match) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function formatTime(value: string): string {
  return value.slice(0, 5);
}

function formatEnd(start: string, end: string | null): string {
  if (end && timeToMinutes(end) !== null) return formatTime(end);
  const startMinutes = timeToMinutes(start);
  if (startMinutes === null) return '—';
  const endMinutes = startMinutes + 30;
  return `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
}

export function describeAppointmentConflict({
  resource,
  existingStart,
  existingEnd,
  requestedStart,
  requestedEnd,
}: AppointmentConflictMessageInput): string {
  const existing = `${formatTime(existingStart)}–${formatEnd(existingStart, existingEnd)}`;
  const requested = `${formatTime(requestedStart)}–${formatTime(requestedEnd)}`;

  if (resource === 'sala') {
    return `A sala está ocupada de ${existing}; o horário solicitado é ${requested}. Escolha outra sala ou outro horário.`;
  }

  return `O ${resource} já tem um atendimento de ${existing}; o horário solicitado é ${requested}. Escolha outro horário.`;
}
