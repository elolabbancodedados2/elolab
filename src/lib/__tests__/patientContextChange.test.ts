import { describe, expect, it } from 'vitest';
import { needsPatientContextChangeConfirmation } from '@/lib/patientContextChange';

describe('patient context change', () => {
  it('asks before changing to another patient while a clinical form is open', () => {
    expect(needsPatientContextChangeConfirmation(true, 'patient-1', 'patient-2')).toBe(true);
  });

  it('does not ask when staying on the same patient or when no form is open', () => {
    expect(needsPatientContextChangeConfirmation(true, 'patient-1', 'patient-1')).toBe(false);
    expect(needsPatientContextChangeConfirmation(false, 'patient-1', 'patient-2')).toBe(false);
  });
});
