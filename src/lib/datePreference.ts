import { format as formatDateFns } from 'date-fns';

type FormatOptions = Parameters<typeof formatDateFns>[2];

/**
 * Formats a date for the interface, honoring the user's short date preference.
 * ISO date keys used by database queries and form inputs do not contain `dd/MM`
 * and therefore keep their stable machine format.
 */
export function formatWithDatePreference(
  date: Date | number,
  pattern: string,
  options?: FormatOptions,
): string {
  const isoPreference = typeof document !== 'undefined'
    && document.documentElement.dataset.dateFormat === 'YYYY-MM-DD';
  if (!isoPreference) return formatDateFns(date, pattern, options);

  const fullDatePattern = /d{1,2}\/M{1,2}(?:\/y{2,4})?/;
  const monthYearPattern = /M{1,2}\/y{2,4}/;
  if (fullDatePattern.test(pattern)) return formatDateFns(date, pattern.replace(fullDatePattern, 'yyyy-MM-dd'), options);
  if (monthYearPattern.test(pattern)) return formatDateFns(date, pattern.replace(monthYearPattern, 'yyyy-MM'), options);
  return formatDateFns(date, pattern, options);
}

/** Formats a timestamp in a fixed business timezone while honoring the UI preference. */
export function formatDateInTimeZone(value: Date | string, timeZone = 'America/Sao_Paulo'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
  if (typeof document !== 'undefined' && document.documentElement.dataset.dateFormat === 'YYYY-MM-DD') {
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  return `${part('day')}/${part('month')}/${part('year')}`;
}
