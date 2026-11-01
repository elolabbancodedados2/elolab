/** Regras de exibição do patrimônio que não dependem do React. */

const ROTULOS_ACAO: Record<string, string> = {
  asset_created: 'Equipamento cadastrado',
  asset_updated: 'Equipamento atualizado',
  order_created: 'Ordem de serviço aberta',
  order_updated: 'Ordem de serviço atualizada',
  document_added: 'Documento anexado',
};

/** Ação da auditoria em português, com o status novo quando houver. */
export function rotuloAuditoria(
  acao: string,
  detalhes: Record<string, unknown> | null | undefined,
  rotulos: { status: Record<string, string>; ordem: Record<string, string> },
): string {
  const base = ROTULOS_ACAO[acao] ?? acao.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  const status = typeof detalhes?.status === 'string' ? detalhes.status : null;
  if (!status) return base;
  if (acao === 'asset_updated' && rotulos.status[status]) return `${base}: ${rotulos.status[status].toLowerCase()}`;
  if (acao === 'order_updated' && rotulos.ordem[status]) return `${base}: ${rotulos.ordem[status].toLowerCase()}`;
  return base;
}

/** Abertas e em andamento primeiro (prazo mais próximo antes); depois as encerradas, mais recentes primeiro. */
export function ordenarOrdensDoAtivo<T extends { status: string; due_on: string | null; created_at: string }>(ordens: T[]): T[] {
  const ativa = (o: T) => o.status === 'open' || o.status === 'in_progress';
  return [...ordens].sort((a, b) => {
    if (ativa(a) !== ativa(b)) return ativa(a) ? -1 : 1;
    if (ativa(a)) {
      const pa = a.due_on?.slice(0, 10) ?? '9999-12-31';
      const pb = b.due_on?.slice(0, 10) ?? '9999-12-31';
      if (pa !== pb) return pa.localeCompare(pb);
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

export type SituacaoGarantia = { tipo: 'sem_garantia' } | { tipo: 'vencida' } | { tipo: 'vigente' } | { tipo: 'termina'; dias: number };

/** "termina" quando faltam 60 dias ou menos; "vigente" quando ainda há mais tempo. */
export function situacaoGarantia(garantiaAte: string | null | undefined, hoje: string, aviso = 60): SituacaoGarantia {
  const data = garantiaAte?.slice(0, 10);
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return { tipo: 'sem_garantia' };
  const dias = Math.round((Date.parse(`${data}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
  if (dias < 0) return { tipo: 'vencida' };
  return dias <= aviso ? { tipo: 'termina', dias } : { tipo: 'vigente' };
}
