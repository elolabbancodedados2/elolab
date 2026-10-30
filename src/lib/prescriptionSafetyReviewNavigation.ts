import type { Location } from 'react-router-dom';

const REVIEW_STEP = 'alertas-seguranca';
const PRESCRIPTION_ROUTE = '/documentos-clinicos/nova-prescricao';

export function isPrescriptionSafetyReviewNavigation(
  current: Pick<Location, 'pathname' | 'search'>,
  next: Pick<Location, 'pathname' | 'search'>,
): boolean {
  if (current.pathname !== PRESCRIPTION_ROUTE || next.pathname !== PRESCRIPTION_ROUTE) return false;

  const currentParams = new URLSearchParams(current.search);
  const nextParams = new URLSearchParams(next.search);
  const currentStep = currentParams.get('tela');
  const nextStep = nextParams.get('tela');
  if (![null, REVIEW_STEP].includes(currentStep) || ![null, REVIEW_STEP].includes(nextStep)) return false;
  if (currentStep === nextStep) return false;

  currentParams.delete('tela');
  nextParams.delete('tela');
  return currentParams.toString() === nextParams.toString();
}
