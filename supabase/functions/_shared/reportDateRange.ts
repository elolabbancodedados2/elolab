function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateOnlyInTimeZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function inicioDoDiaEmFusoIso(data: string, timeZone: string): string {
  if (!isValidDateOnly(data)) throw new Error('Data civil inválida.');

  const centro = Date.parse(`${data}T00:00:00Z`);
  let inferior = centro - 36 * 60 * 60 * 1000;
  let superior = centro + 36 * 60 * 60 * 1000;

  while (superior - inferior > 1) {
    const meio = Math.floor((inferior + superior) / 2);
    if (dateOnlyInTimeZone(new Date(meio), timeZone) >= data) superior = meio;
    else inferior = meio;
  }

  return new Date(superior).toISOString();
}

export function dateRangeInTimeZoneIso(
  startDate: string | undefined,
  endDate: string | undefined,
  timeZone: string,
): { gte?: string; lt?: string } {
  if (startDate && !isValidDateOnly(startDate)) throw new Error('Data inicial inválida.');
  if (endDate && !isValidDateOnly(endDate)) throw new Error('Data final inválida.');
  if (startDate && endDate && startDate > endDate) throw new Error('Intervalo de datas inválido.');

  const nextDay = endDate
    ? new Date(Date.parse(`${endDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    : undefined;
  return {
    ...(startDate ? { gte: inicioDoDiaEmFusoIso(startDate, timeZone) } : {}),
    ...(nextDay ? { lt: inicioDoDiaEmFusoIso(nextDay, timeZone) } : {}),
  };
}
