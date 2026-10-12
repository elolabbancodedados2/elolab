function toMinutes(value?: string | null): number | null {
  if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

/** Mirrors the database's 30-minute fallback for legacy appointments without hora_fim. */
export function appointmentEndMinutes(startTime: string, endTime?: string | null): number | null {
  const start = toMinutes(startTime);
  if (start === null) return null;
  return toMinutes(endTime) ?? start + 30;
}
