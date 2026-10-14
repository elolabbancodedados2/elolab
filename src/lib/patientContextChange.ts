export function needsPatientContextChangeConfirmation(
  formOpen: boolean,
  currentPatientId: string | null | undefined,
  nextPatientId: string | null | undefined,
): boolean {
  return formOpen && !!currentPatientId && !!nextPatientId && currentPatientId !== nextPatientId;
}
