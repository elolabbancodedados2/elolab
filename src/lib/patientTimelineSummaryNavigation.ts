import type { Location } from 'react-router-dom';

const SUMMARY_STEP = 'summary';

function isPatientHistoryPath(pathname: string): boolean {
  return pathname === '/pacientes'
    || /^\/pacientes\/[^/]+$/.test(pathname)
    || pathname === '/prontuarios'
    || pathname === '/prontuarios/atendimento';
}

export function isPatientTimelineSummaryNavigation(
  current: Pick<Location, 'pathname' | 'search'>,
  next: Pick<Location, 'pathname' | 'search'>,
): boolean {
  if (current.pathname !== next.pathname || !isPatientHistoryPath(current.pathname)) return false;

  const currentParams = new URLSearchParams(current.search);
  const nextParams = new URLSearchParams(next.search);
  const currentStep = currentParams.get('timeline');
  const nextStep = nextParams.get('timeline');
  if ((currentStep !== null && currentStep !== SUMMARY_STEP) || (nextStep !== null && nextStep !== SUMMARY_STEP)) return false;
  if (currentStep === nextStep) return false;

  currentParams.delete('timeline');
  nextParams.delete('timeline');
  return currentParams.toString() === nextParams.toString();
}
