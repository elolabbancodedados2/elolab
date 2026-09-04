import { format } from 'date-fns';

export function toDateTimeLocalValue(date: Date = new Date()): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function isValidDateTimeLocal(value: string): boolean {
  return value.length > 0 && !Number.isNaN(new Date(value).getTime());
}
