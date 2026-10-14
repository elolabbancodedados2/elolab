import { afterEach, describe, expect, it } from 'vitest';
import { formatDateInTimeZone, formatWithDatePreference } from '@/lib/datePreference';

describe('formatWithDatePreference', () => {
  afterEach(() => { delete document.documentElement.dataset.dateFormat; });

  it('keeps Brazilian date format by default', () => {
    expect(formatWithDatePreference(new Date(2026, 9, 12), 'dd/MM/yyyy')).toBe('12/10/2026');
  });

  it('uses ISO order for displayed numeric dates, including timestamps', () => {
    document.documentElement.dataset.dateFormat = 'YYYY-MM-DD';
    expect(formatWithDatePreference(new Date(2026, 9, 12, 9, 30), "dd/MM/yyyy 'às' HH:mm")).toBe('2026-10-12 às 09:30');
    expect(formatWithDatePreference(new Date(2026, 9, 12), 'dd/MM')).toBe('2026-10-12');
  });

  it('leaves ISO query keys unchanged by the display preference', () => {
    document.documentElement.dataset.dateFormat = 'YYYY-MM-DD';
    expect(formatWithDatePreference(new Date(2026, 9, 12), 'yyyy-MM-dd')).toBe('2026-10-12');
    expect(formatWithDatePreference(new Date(2026, 9, 12), 'MM/yyyy')).toBe('2026-10');
  });

  it('keeps the Sao Paulo day stable while changing only its display order', () => {
    const instant = '2026-10-13T01:00:00.000Z';
    expect(formatDateInTimeZone(instant)).toBe('12/10/2026');
    document.documentElement.dataset.dateFormat = 'YYYY-MM-DD';
    expect(formatDateInTimeZone(instant)).toBe('2026-10-12');
  });
});
