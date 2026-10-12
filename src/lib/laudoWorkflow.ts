export function podeRetificarResultado(statusColeta: string | null | undefined, liberado: boolean): boolean {
  return liberado || statusColeta === 'validado';
}

export function deveNotificarRetificacao(liberadoAtual: boolean | null | undefined, liberadoAntes: boolean): boolean {
  return liberadoAtual ?? liberadoAntes;
}

export function perfilPodeRetificarResultado(roles: string[] | null | undefined): boolean {
  return roles?.some(role => role === 'admin' || role === 'enfermagem') ?? false;
}
