export interface CriticalResultAcknowledgementState {
  critico: boolean | null | undefined;
  numero_versao: number | null | undefined;
  confirmacoes: Array<{ numero_versao: number }> | null | undefined;
}

export function criticalAcknowledgementIsPending({
  critico,
  numero_versao,
  confirmacoes,
}: CriticalResultAcknowledgementState): boolean {
  if (critico !== true || typeof numero_versao !== 'number') return false;
  return !(confirmacoes ?? []).some(confirmacao => confirmacao.numero_versao === numero_versao);
}
