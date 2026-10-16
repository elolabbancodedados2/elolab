export type PreferenciaCanalLembrete = 'ambos' | 'email' | 'whatsapp' | 'nenhum';

export function canaisDeLembrete(
  preference: PreferenciaCanalLembrete | null | undefined,
  hasEmail: boolean,
  hasWhatsapp: boolean,
): { email: boolean; whatsapp: boolean } {
  // Cadastros anteriores à preferência continuam recebendo pelos canais cadastrados.
  const selected = preference ?? 'ambos';
  if (!['ambos', 'email', 'whatsapp', 'nenhum'].includes(selected)) {
    return { email: false, whatsapp: false };
  }

  return {
    email: hasEmail && (selected === 'ambos' || selected === 'email'),
    whatsapp: hasWhatsapp && (selected === 'ambos' || selected === 'whatsapp'),
  };
}

function horaEmMinutos(hora: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return null;
  const [hours, minutes] = hora.split(':').map(Number);
  return hours * 60 + minutes;
}

export function dentroDaJanelaDeContato(
  instant: string | Date,
  inicio: string | null | undefined,
  fim: string | null | undefined,
  timeZone: string | null | undefined,
): boolean {
  const start = horaEmMinutos(inicio ?? '');
  const end = horaEmMinutos(fim ?? '');
  if (start === null || end === null || start === end || !timeZone) return false;

  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return false;

  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return false;

    const current = hour * 60 + minute;
    return start < end ? current >= start && current < end : current >= start || current < end;
  } catch {
    return false;
  }
}
