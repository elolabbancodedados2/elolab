import { describe, expect, it } from 'vitest';
import { formatarDataOcupacaoAntiga } from '../roomOccupancy';

describe('data de ocupação de sala', () => {
  it('identifica e formata ocupações de outro dia', () => {
    expect(formatarDataOcupacaoAntiga('2026-10-10', '2026-10-11')).toBe('10/10/2026');
  });

  it('não marca ocupação de hoje ou data ausente como antiga', () => {
    expect(formatarDataOcupacaoAntiga('2026-10-11', '2026-10-11')).toBeNull();
    expect(formatarDataOcupacaoAntiga(null, '2026-10-11')).toBeNull();
  });
});
