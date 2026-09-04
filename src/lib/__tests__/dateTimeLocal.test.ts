import { describe, expect, it } from 'vitest';
import { isValidDateTimeLocal, toDateTimeLocalValue } from '@/lib/dateTimeLocal';

describe('campo de data e hora local', () => {
  it('preserva a hora local exibida ao usuário', () => {
    const local = new Date(2026, 8, 4, 14, 35);
    expect(toDateTimeLocalValue(local)).toBe('2026-09-04T14:35');
  });

  it('rejeita valores vazios ou incompletos', () => {
    expect(isValidDateTimeLocal('2026-09-04T14:35')).toBe(true);
    expect(isValidDateTimeLocal('')).toBe(false);
    expect(isValidDateTimeLocal('2026-09-04T')).toBe(false);
  });
});
