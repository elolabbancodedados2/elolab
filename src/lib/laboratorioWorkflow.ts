const STATUS_COM_RESULTADO_ABERTO = new Set(['coletado', 'em_analise']);

export const STATUS_COLETA_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  coletado: 'Coletado',
  em_analise: 'Em Análise',
  validado: 'Validado',
  liberado: 'Liberado',
  cancelado: 'Cancelado',
  recoleta: 'Recoleta',
  rejeitada: 'Rejeitada',
};

export function podeGerenciarLaboratorioPorPapel(roles: readonly string[] | null | undefined): boolean {
  return roles?.some((role) => role === 'admin' || role === 'enfermagem') ?? false;
}

export function dadosAoRegistrarColeta(instante: Date, usuarioId: string | null | undefined) {
  return { data_coleta: instante.toISOString(), coletado_por: usuarioId ?? null };
}

export function podeRegistrarResultado(status: string | null | undefined): boolean {
  return status != null && STATUS_COM_RESULTADO_ABERTO.has(status);
}
