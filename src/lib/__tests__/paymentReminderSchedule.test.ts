import { describe, expect, it } from 'vitest';

import { saoPauloDate, saoPauloDayWindow, shiftCivilDate } from '../../../supabase/functions/_shared/paymentReminderSchedule';

describe('payment reminder schedule', () => {
  it('uses the civil date in São Paulo across UTC midnight', () => {
    expect(saoPauloDate(new Date('2026-11-01T02:59:00Z'))).toBe('2026-10-31');
    expect(saoPauloDate(new Date('2026-11-01T03:00:00Z'))).toBe('2026-11-01');
  });

  it('builds a half-open local-day window for a due date', () => {
    expect(saoPauloDayWindow('2026-11-01')).toEqual({
      start: '2026-11-01T00:00:00-03:00',
      end: '2026-11-02T00:00:00-03:00',
    });
  });

  it('shifts a civil date without using the machine time zone', () => {
    expect(shiftCivilDate('2026-10-31', 1)).toBe('2026-11-01');
  });
});
