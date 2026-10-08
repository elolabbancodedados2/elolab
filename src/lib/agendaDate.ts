import { isValid, parseISO } from 'date-fns';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidAgendaDate(value: string | null | undefined): value is string {
  return Boolean(value && DATE_ONLY_PATTERN.test(value) && isValid(parseISO(value)));
}

export function normalizeAgendaDate(value: string | null | undefined): string {
  return isValidAgendaDate(value) ? value : todaySaoPauloDateOnly();
}
