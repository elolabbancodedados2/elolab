import { SLA_LAB_PADRAO_HORAS } from '@/lib/laboratorioSla';

/** Estados em que a amostra ainda está no fluxo do laboratório. */
export const STATUS_EM_ABERTO_SLA = new Set(['pendente', 'recoleta', 'coletado', 'em_analise', 'validado']);

type ColetaPrazo = {
  status?: string | null;
  urgente?: boolean | null;
  created_at?: string | null;
  data_coleta?: string | null;
  setor_id?: string | null;
  exames?: { tipo_exames_catalog?: { tempo_estimado_horas?: number | null } | Array<{ tempo_estimado_horas?: number | null }> | null } | null;
};

/** Limite de alerta do setor (vazio usa o mesmo padrão do banco). */
export function slaHorasDoSetor(setorId: string | null | undefined, setores: Array<{ id: string; sla_alerta_horas?: number | null }>): number {
  const horas = setores.find(setor => setor.id === setorId)?.sla_alerta_horas;
  return horas && horas > 0 ? horas : SLA_LAB_PADRAO_HORAS;
}

export type SituacaoSla = 'ok' | 'atencao' | 'estourado' | 'encerrado';

/** Atenção a partir de metade do limite; estourado acima do limite. Só conta amostra em aberto. */
export function situacaoSla(coleta: ColetaPrazo, slaHoras: number, agora: Date): SituacaoSla {
  if (!coleta.status || !STATUS_EM_ABERTO_SLA.has(coleta.status) || !coleta.created_at) return 'encerrado';
  const horas = (agora.getTime() - new Date(coleta.created_at).getTime()) / 3_600_000;
  if (horas > slaHoras) return 'estourado';
  if (horas > slaHoras / 2) return 'atencao';
  return 'ok';
}

/**
 * Próxima amostra a coletar: urgentes primeiro e, entre elas, a mais antiga.
 * A lista chega ordenada da mais nova para a mais antiga.
 */
export function proximaColetaPendente<T extends ColetaPrazo>(coletas: T[]): T | null {
  const pendentes = coletas.filter(coleta => coleta.status === 'pendente');
  if (!pendentes.length) return null;
  return [...pendentes].sort((a, b) => {
    if (!!a.urgente !== !!b.urgente) return a.urgente ? -1 : 1;
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
  })[0];
}

function horasDoCatalogo(coleta: ColetaPrazo): number | null {
  const catalogo = coleta.exames?.tipo_exames_catalog;
  const item = Array.isArray(catalogo) ? catalogo[0] : catalogo;
  const horas = item?.tempo_estimado_horas;
  return horas && horas > 0 ? horas : null;
}

/** Previsão de entrega pelo prazo do catálogo, contado da coleta (ou do pedido, se ainda não coletada). */
export function previsaoEntrega(coleta: ColetaPrazo, agora: Date): { previstoPara: Date; atrasado: boolean } | null {
  const horas = horasDoCatalogo(coleta);
  const inicio = coleta.data_coleta || coleta.created_at;
  if (!horas || !inicio) return null;
  const previstoPara = new Date(new Date(inicio).getTime() + horas * 3_600_000);
  const emAberto = !!coleta.status && STATUS_EM_ABERTO_SLA.has(coleta.status);
  return { previstoPara, atrasado: emAberto && agora.getTime() > previstoPara.getTime() };
}
