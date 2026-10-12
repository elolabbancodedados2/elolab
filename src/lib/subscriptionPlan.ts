export interface AssinaturaPlanoUsuario {
  plano_slug: string;
  plano_nome: string;
  status: string;
  em_trial: boolean;
  trial_fim: string | null;
  data_fim: string | null;
  cobranca_modalidade: 'recorrente' | 'pre_pago' | null;
}

export function normalizarAssinaturaPlano(row: any): AssinaturaPlanoUsuario | null {
  if (!row || typeof row.plano_slug !== 'string') return null;
  return {
    plano_slug: row.plano_slug,
    plano_nome: row.planos?.nome || row.plano_slug,
    status: String(row.status || ''),
    em_trial: Boolean(row.em_trial),
    trial_fim: row.trial_fim ?? null,
    data_fim: row.data_fim ?? null,
    cobranca_modalidade: row.cobranca_modalidade === 'recorrente' || row.cobranca_modalidade === 'pre_pago'
      ? row.cobranca_modalidade
      : null,
  };
}
