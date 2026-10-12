export interface MemedVerificationContext {
  prescriptionId: string;
  prescriptionUuid?: string | null;
  patientExternalId: string;
  prescriberCpf: string;
  prescriberCrm: string;
  prescriberUf: string;
}

const object = (value: unknown): Record<string, any> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

function unwrapResource(value: unknown): Record<string, any> | null {
  const root = object(value);
  if (!root) return null;
  const data = object(root.data);
  const attributes = object(data?.attributes);
  return attributes ? { ...attributes, id: attributes.id ?? data?.id } : data ?? root;
}

export function verificarPrescricaoMemedOficial(
  responseBody: unknown,
  expected: MemedVerificationContext,
): Record<string, any> | null {
  const root = unwrapResource(responseBody);
  if (!root) return null;

  const prescription = object(root.prescricao) ?? root;
  const id = String(prescription.id ?? root.id ?? '');
  const uuid = String(prescription.prescriptionUuid ?? prescription.uuid ?? root.prescriptionUuid ?? root.uuid ?? '');
  const patient = object(prescription.paciente) ?? object(root.paciente) ?? object(prescription.patient) ?? object(root.patient);
  const patientExternalId = String(patient?.external_id ?? patient?.externalId ?? '');
  const medicosValue = prescription.medicos ?? root.medicos ?? prescription.prescritor ?? root.prescritor;
  const medicos = Array.isArray(medicosValue) ? medicosValue.map(object).filter(Boolean) : [object(medicosValue)].filter(Boolean);
  const prescriberMatches = medicos.some((medico) =>
    digits(medico?.cpf) === digits(expected.prescriberCpf)
      && digits(medico?.crm) === digits(expected.prescriberCrm)
      && String(medico?.uf ?? medico?.crm_uf ?? '').trim().toUpperCase() === expected.prescriberUf.trim().toUpperCase()
  );

  if (id !== expected.prescriptionId || patientExternalId !== expected.patientExternalId || !prescriberMatches) return null;
  if (expected.prescriptionUuid && uuid !== expected.prescriptionUuid) return null;
  const medications = prescription.medicamentos ?? root.medicamentos;
  if (!Array.isArray(medications) || medications.length === 0) return null;
  return root;
}

export function extrairIdentificadoresCallbackMemed(payload: unknown) {
  const root = object(payload);
  if (!root) return null;
  const prescription = object(root.prescricao) ?? root;
  const id = prescription.id ?? root.id;
  const uuid = prescription.prescriptionUuid ?? prescription.uuid ?? root.prescriptionUuid ?? root.uuid;
  if (id === undefined || id === null || !String(id).trim()) return null;
  return { id: String(id).slice(0, 200), uuid: typeof uuid === 'string' ? uuid.slice(0, 200) : null };
}
