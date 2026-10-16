type PatientContactFields = {
  telefone?: string | null;
  email?: string | null;
};

export function describeMissingPatientContacts(patient: PatientContactFields): string | null {
  const missing: string[] = [];
  if (!patient.telefone?.trim()) missing.push('telefone');
  if (!patient.email?.trim()) missing.push('e-mail');
  if (missing.length === 0) return null;
  if (missing.length === 2) return 'Sem telefone e e-mail';
  return `Sem ${missing[0]}`;
}
