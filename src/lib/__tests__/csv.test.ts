import { describe, expect, it } from 'vitest';
import { formatCsvCell } from '../csv';

describe('formatCsvCell', () => {
  it('neutraliza fórmula e mantém número negativo', () => {
    expect(formatCsvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(formatCsvCell(' -2+3')).toBe(`"' -2+3"`);
    expect(formatCsvCell('-12,50')).toBe('"-12,50"');
    expect(formatCsvCell(null)).toBe('""');
  });
});
