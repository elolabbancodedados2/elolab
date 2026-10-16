const TIME_ZONE = 'America/Sao_Paulo';

function dateParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  return Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
}

export function saoPauloDate(value: Date): string {
  const parts = dateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function shiftCivilDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function offsetForCivilDate(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  const offsetName = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  }).formatToParts(value).find(({ type }) => type === 'timeZoneName')?.value;
  const match = offsetName?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) throw new Error(`Não foi possível determinar o fuso de ${TIME_ZONE}.`);
  return `${match[1]}${match[2].padStart(2, '0')}:${match[3] || '00'}`;
}

export function saoPauloDayWindow(date: string) {
  const nextDate = shiftCivilDate(date, 1);
  return {
    start: `${date}T00:00:00${offsetForCivilDate(date)}`,
    end: `${nextDate}T00:00:00${offsetForCivilDate(nextDate)}`,
  };
}
