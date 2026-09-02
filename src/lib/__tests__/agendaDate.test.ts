import { describe, expect, it } from 'vitest';
import { isValidAgendaDate, normalizeAgendaDate } from '@/lib/agendaDate';

describe('datas da agenda', () => {
  it('aceita somente uma data completa e existente', () => {
    expect(isValidAgendaDate('2026-09-01')).toBe(true);
    expect(isValidAgendaDate('')).toBe(false);
    expect(isValidAgendaDate('2026-09')).toBe(false);
    expect(isValidAgendaDate('2026-02-31')).toBe(false);
  });

  it('recupera uma data inválida salva na sessão', () => {
    expect(isValidAgendaDate(normalizeAgendaDate(''))).toBe(true);
    expect(isValidAgendaDate(normalizeAgendaDate('data-inválida'))).toBe(true);
  });
});
