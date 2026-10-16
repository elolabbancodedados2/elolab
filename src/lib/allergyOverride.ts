export interface AllergyOverrideAlert {
  id: string;
  canIgnore: boolean;
}

export const ALLERGY_OVERRIDE_JUSTIFICATION_MIN_LENGTH = 20;

export function requiresAllergyOverrideJustification(alerts: AllergyOverrideAlert[]): boolean {
  return alerts.some(alert => alert.id.startsWith('allergy-') && alert.canIgnore);
}

export function allergyOverrideJustificationError(
  alerts: AllergyOverrideAlert[],
  justification: string,
): string | null {
  if (!requiresAllergyOverrideJustification(alerts)) return null;
  if (justification.trim().length < ALLERGY_OVERRIDE_JUSTIFICATION_MIN_LENGTH) {
    return `Explique a justificativa clínica (mínimo de ${ALLERGY_OVERRIDE_JUSTIFICATION_MIN_LENGTH} caracteres) para prosseguir diante do alerta de alergia.`;
  }
  return null;
}
