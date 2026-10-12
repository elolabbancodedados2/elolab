import { describe, expect, it } from 'vitest';
import { formatCsvCell } from '../csv';
import { dateRangeInTimeZoneIso } from '../dateOnly';

describe('exportação CSV de relatórios', () => {
  it.each(['=HYPERLINK("x")', '+SUM(A1:A2)', '-1+2', '@SUM(A1)', '  =1+1']) (
    'neutraliza conteúdo que pode ser interpretado como fórmula: %s', (value) => {
      expect(formatCsvCell(value)).toMatch(/^"'/);
    },
  );

  it('preserva o escaping de aspas e quebras de linha em texto comum', () => {
    expect(formatCsvCell('Ana "Bia"\nMaria')).toBe('"Ana ""Bia"" Maria"');
  });
});

describe('intervalo de datas civis para consultas timestamp', () => {
  it('inclui todo o dia final em São Paulo usando fim exclusivo', () => {
    const range = dateRangeInTimeZoneIso('2026-03-01', '2026-03-31', 'America/Sao_Paulo');

    expect(range).toEqual({
      gte: '2026-03-01T03:00:00.000Z',
      lt: '2026-04-01T03:00:00.000Z',
    });
  });
});
