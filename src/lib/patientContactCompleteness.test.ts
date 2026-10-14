import { describe, expect, it } from 'vitest';
import { describeMissingPatientContacts } from './patientContactCompleteness';

describe('describeMissingPatientContacts', () => {
  it('lists each absent contact channel without echoing contact data', () => {
    expect(describeMissingPatientContacts({ telefone: '  ', email: null })).toBe('Sem telefone e e-mail');
    expect(describeMissingPatientContacts({ telefone: '11999990000', email: '' })).toBe('Sem e-mail');
    expect(describeMissingPatientContacts({ telefone: null, email: 'ana@example.test' })).toBe('Sem telefone');
  });

  it('returns nothing when phone and email are present', () => {
    expect(describeMissingPatientContacts({ telefone: '(11) 99999-0000', email: 'ana@example.test' })).toBeNull();
  });
});
