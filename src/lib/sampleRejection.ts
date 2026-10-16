export const SAMPLE_REJECTION_REASONS = [
  { code: 'identificacao_divergente', label: 'Identificação divergente' },
  { code: 'recipiente_inadequado', label: 'Tubo ou recipiente inadequado' },
  { code: 'volume_insuficiente', label: 'Volume insuficiente' },
  { code: 'hemolisada', label: 'Amostra hemolisada' },
  { code: 'coagulada', label: 'Amostra coagulada' },
  { code: 'conservacao_inadequada', label: 'Conservação inadequada' },
  { code: 'contaminada', label: 'Amostra contaminada' },
  { code: 'prazo_excedido', label: 'Prazo de estabilidade excedido' },
  { code: 'outro', label: 'Outro' },
] as const;

export type SampleRejectionReasonCode = typeof SAMPLE_REJECTION_REASONS[number]['code'];

export interface SampleReasonPayload {
  motivo_codigo: SampleRejectionReasonCode;
  motivo_rotulo: string;
  motivo_detalhe: string | null;
  motivo: string;
}

export function buildSampleReasonPayload(code: string, detail: string): SampleReasonPayload | null {
  const reason = SAMPLE_REJECTION_REASONS.find(item => item.code === code);
  const normalizedDetail = detail.trim();
  if (!reason || normalizedDetail.length > 300) return null;
  if (reason.code === 'outro' && normalizedDetail.length < 5) return null;

  return {
    motivo_codigo: reason.code,
    motivo_rotulo: reason.label,
    motivo_detalhe: normalizedDetail || null,
    motivo: normalizedDetail ? `${reason.label} — ${normalizedDetail}` : reason.label,
  };
}
