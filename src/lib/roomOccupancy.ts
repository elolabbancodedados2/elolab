export function formatarDataOcupacaoAntiga(dataAgendamento: string | null | undefined, hoje: string): string | null {
  if (!dataAgendamento || dataAgendamento >= hoje) return null;
  const [ano, mes, dia] = dataAgendamento.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : null;
}
