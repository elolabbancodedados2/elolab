export type CursorLaudo = { created_at: string; id: string } | null;

export function cursorAposAtualizacaoWorklist(
  cursorAtual: CursorLaudo,
  cursorMaisRecente: CursorLaudo,
  historicoCarregado: boolean,
): CursorLaudo {
  return historicoCarregado && cursorAtual ? cursorAtual : cursorMaisRecente;
}
