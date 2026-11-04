import type { ClinicalAlert } from './clinicalAlerts';

export interface AllergyOverrideAlert {
  id: string;
  canIgnore: boolean;
  severity?: string;
}

export const ALLERGY_OVERRIDE_JUSTIFICATION_MIN_LENGTH = 20;

export function requiresAllergyOverrideJustification(alerts: AllergyOverrideAlert[]): boolean {
  return alerts.some(alert => alert.canIgnore && (alert.id.startsWith('allergy-') || alert.severity === 'warning' || alert.severity === 'critical'));
}

export function allergyOverrideJustificationError(
  alerts: AllergyOverrideAlert[],
  justification: string,
): string | null {
  if (!requiresAllergyOverrideJustification(alerts)) return null;
  if (justification.trim().length < ALLERGY_OVERRIDE_JUSTIFICATION_MIN_LENGTH) {
    return `Explique a justificativa clínica (mínimo de ${ALLERGY_OVERRIDE_JUSTIFICATION_MIN_LENGTH} caracteres) para prosseguir diante do alerta.`;
  }
  return null;
}
export function prescriptionSafetyRecord(alerts: ClinicalAlert[], justification: string) {
  return {
    alertas_seguranca: alerts.map(({ id, severity, title, message, action, canIgnore }) => ({
      id, severity, title, message, action: action ?? null, canIgnore,
    })),
    justificativa_alerta: alerts.length > 0 ? justification.trim() || null : null,
  };
}
