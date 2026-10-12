export function podeAcessarRelatorioCompletoDePacientes(
  roles: readonly string[] | null | undefined,
): boolean {
  return roles?.includes('admin') ?? false;
}

export function podeExportarFontesCompletas(
  fontesDaExportacao: readonly string[],
  fontesLimitadas: readonly string[],
): boolean {
  return !fontesDaExportacao.some((fonte) => fontesLimitadas.includes(fonte));
}

export function existeMaisResultadoQueLimite(recebidos: number, limite: number): boolean {
  return recebidos > limite;
}
