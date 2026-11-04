/** Remove os identificadores conhecidos antes de montar o contexto do provedor. */
export function clinicalSummaryContext(
  patient: { nome?: string | null; data_nascimento?: string | null; sexo?: string | null; alergias?: unknown },
  records: Record<string, unknown>,
  today = new Date(),
) {
  const birth = patient.data_nascimento?.slice(0, 10);
  const [year, month, day] = (birth || '').split('-').map(Number);
  let age: number | null = null;
  if (year && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
    age = today.getUTCFullYear() - year - (today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day) ? 1 : 0);
    if (age < 0) age = null;
  }
  const identifiers = [patient.nome, birth, birth?.split('-').reverse().join('/')].filter((v): v is string => !!v);
  const redact = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return identifiers.reduce((text, identifier) => text.replace(new RegExp(identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[omitido]'), value);
    }
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, redact(val)]));
    return value;
  };
  return { ...redact(records) as Record<string, unknown>, paciente: { idade: age, sexo: patient.sexo ?? null }, alergias: redact(patient.alergias ?? []) };
}
