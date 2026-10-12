import { describe, expect, it } from 'vitest';
import { dateRangeInTimeZoneIso } from '../../../supabase/functions/_shared/reportDateRange';

describe('intervalos civis para relatórios agendados', () => {
  it('inclui todos os dias selecionados no horário de São Paulo', () => {
    expect(dateRangeInTimeZoneIso('2026-03-01', '2026-03-31', 'America/Sao_Paulo')).toEqual({
      gte: '2026-03-01T03:00:00.000Z',
      lt: '2026-04-01T03:00:00.000Z',
    });
  });

  it('não cria limites quando as datas são opcionais', () => {
    expect(dateRangeInTimeZoneIso(undefined, undefined, 'America/Sao_Paulo')).toEqual({});
  });
});
