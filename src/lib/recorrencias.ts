import { emCentavos } from '@/lib/dinheiro';
import { proximaOcorrencia } from '@/lib/projecaoFluxoCaixa';

export interface LancamentoRecorrente {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  categoria: string | null;
  fornecedor: string | null;
  status: string | null;
  data_vencimento: string | null;
  frequencia_recorrencia: string | null;
  recorrencia_origem_id: string | null;
  recorrente: boolean | null;
}

export interface SerieRecorrente {
  /** Ocorrência mais recente: é ela que gera a próxima ao ser paga. */
  atual: LancamentoRecorrente;
  ocorrencias: number;
  /** Vencimento da conta em aberto, ou o da próxima que será criada. */
  proximoVencimento: string | null;
  emAberto: boolean;
  totalMensalEstimado: number;
}

const ABERTO = ['pendente', 'atrasado', 'parcial'];
const POR_MES: Record<string, number> = { semanal: 52 / 12, quinzenal: 26 / 12, mensal: 1, bimestral: 1 / 2, trimestral: 1 / 3, anual: 1 / 12 };

/**
 * Agrupa as ocorrências de cada conta recorrente pela cadeia
 * `recorrencia_origem_id`. A série ativa é a ocorrência que ninguém continuou
 * e que ainda está marcada como recorrente; canceladas ficam de fora.
 */
export function seriesRecorrentes(lancamentos: ReadonlyArray<LancamentoRecorrente>): SerieRecorrente[] {
  const porId = new Map(lancamentos.map(l => [l.id, l]));
  const continuadas = new Set(lancamentos.map(l => l.recorrencia_origem_id).filter((id): id is string => Boolean(id)));
  const series: SerieRecorrente[] = [];
  for (const atual of lancamentos) {
    if (!atual.recorrente || continuadas.has(atual.id) || atual.status === 'cancelado') continue;
    let ocorrencias = 1;
    let origem = atual.recorrencia_origem_id ? porId.get(atual.recorrencia_origem_id) : undefined;
    const vistos = new Set([atual.id]);
    while (origem && !vistos.has(origem.id)) {
      vistos.add(origem.id);
      ocorrencias += 1;
      origem = origem.recorrencia_origem_id ? porId.get(origem.recorrencia_origem_id) : undefined;
    }
    const emAberto = ABERTO.includes(atual.status ?? '');
    const proximoVencimento = emAberto
      ? atual.data_vencimento
      : atual.data_vencimento ? proximaOcorrencia(atual.data_vencimento, atual.frequencia_recorrencia) : null;
    const fator = POR_MES[atual.frequencia_recorrencia ?? ''] ?? 0;
    series.push({
      atual,
      ocorrencias,
      proximoVencimento,
      emAberto,
      totalMensalEstimado: Math.round(emCentavos(atual.valor) * fator) / 100,
    });
  }
  return series.sort((a, b) => (a.proximoVencimento ?? '9999').localeCompare(b.proximoVencimento ?? '9999'));
}
