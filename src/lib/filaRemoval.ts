export const FILA_REMOVAL_REASONS = [
  { value: 'paciente_desistiu', label: 'Paciente desistiu' },
  { value: 'encaminhado_outro_setor', label: 'Encaminhado a outro setor' },
  { value: 'duplicidade_atendimento', label: 'Atendimento duplicado' },
  { value: 'ajuste_operacional', label: 'Ajuste operacional' },
  { value: 'outro', label: 'Outro' },
] as const;

export type FilaRemovalReason = (typeof FILA_REMOVAL_REASONS)[number]['value'];

export function isFilaRemovalReason(value: unknown): value is FilaRemovalReason {
  return typeof value === 'string' && FILA_REMOVAL_REASONS.some((reason) => reason.value === value);
}

export function filaRemovalReasonLabel(value: unknown): string {
  return FILA_REMOVAL_REASONS.find((reason) => reason.value === value)?.label ?? 'Outro';
}
