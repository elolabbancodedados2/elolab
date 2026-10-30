export interface ReceptionPatientSummary {
  cpf?: string | null;
  telefone?: string | null;
  data_nascimento?: string | null;
  convenio_id?: string | null;
  numero_carteira?: string | null;
  validade_carteira?: string | null;
}

export function receptionReadiness(patient: ReceptionPatientSummary | null | undefined, today: string) {
  const missing: string[] = [];
  if (!patient?.cpf?.trim()) missing.push('CPF não cadastrado');
  if (!patient?.telefone?.trim()) missing.push('telefone não cadastrado');
  if (!patient?.data_nascimento) missing.push('data de nascimento não cadastrada');

  const insuranceRequired = Boolean(patient?.convenio_id);
  if (insuranceRequired && !patient?.numero_carteira?.trim()) missing.push('número da carteirinha não cadastrado');
  if (insuranceRequired && !patient?.validade_carteira) missing.push('validade da carteirinha não cadastrada');
  if (insuranceRequired && patient?.validade_carteira && patient.validade_carteira < today) {
    missing.push('carteirinha vencida');
  }

  return { missing, insuranceRequired };
}
