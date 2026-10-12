import { describe, expect, it } from 'vitest';
import { getSupportAccessStatus } from '../supportAccess';

describe('estado do acesso assistido', () => {
  it('marca autorização aprovada como expirada após o vencimento', () => {
    expect(getSupportAccessStatus('approved', '2026-10-11T12:00:00.000Z', Date.parse('2026-10-11T12:00:01.000Z'))).toBe('expired');
  });

  it('mantém aprovada enquanto a autorização ainda está válida', () => {
    expect(getSupportAccessStatus('approved', '2026-10-11T12:00:00.000Z', Date.parse('2026-10-11T11:59:59.000Z'))).toBe('approved');
  });

  it('não altera solicitações sem prazo de aprovação', () => {
    expect(getSupportAccessStatus('requested', null)).toBe('requested');
  });
});
