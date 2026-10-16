import { describe, expect, it } from 'vitest';
import { allergyOverrideJustificationError, requiresAllergyOverrideJustification } from '@/lib/allergyOverride';

const alert = (id: string, canIgnore: boolean) => ({ id, canIgnore });

describe('prescription allergy override', () => {
  it('requires a reason only when an ignorable allergy risk is being overridden', () => {
    expect(requiresAllergyOverrideJustification([alert('allergy-cross-penicillin-cephalosporin', true)])).toBe(true);
    expect(requiresAllergyOverrideJustification([alert('allergy-direct', false)])).toBe(false);
    expect(requiresAllergyOverrideJustification([alert('pregnancy-warning', true)])).toBe(false);
  });

  it('rejects missing or too short justification and accepts a useful clinical reason', () => {
    const alerts = [alert('allergy-cross-class', true)];
    expect(allergyOverrideJustificationError(alerts, '')).not.toBeNull();
    expect(allergyOverrideJustificationError(alerts, 'ok')).not.toBeNull();
    expect(allergyOverrideJustificationError(alerts, 'Histórico avaliado e benefício supera o risco')).toBeNull();
    expect(allergyOverrideJustificationError([alert('dose-warning', true)], '')).toBeNull();
  });
});
