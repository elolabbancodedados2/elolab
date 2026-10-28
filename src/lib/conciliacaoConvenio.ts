import { emCentavos } from '@/lib/dinheiro';
import { valorRealizado } from '@/lib/lancamentos';

export interface LoteConciliacao { id: string; numero_lote: string; convenio_nome: string; valor_pago: number }
export interface LancamentoConvenio {
  id: string;
  tipo: string;
  categoria: string | null;
  forma_pagamento?: string | null;
  valor: number;
  valor_pago: number | null;
  status: string | null;
  lote_tiss_id: string | null;
  descricao: string | null;
  data: string;
}

export type SituacaoConciliacao = 'conciliado' | 'recebido_sem_lancamento' | 'lancado_acima_do_retorno';

const realizado = (status: string | null) => status === 'pago' || status === 'parcial';
const ehRecebimentoConvenio = (l: LancamentoConvenio) =>
  l.tipo === 'receita' && (l.categoria === 'convenio_repasse' || l.forma_pagamento === 'convenio');

/**
 * Compara o total recebido informado em cada lote com o que já está lançado
 * no financeiro (receitas vinculadas menos ajustes de convênio). Apenas
 * leitura: divergências e recebimentos sem lote são sinalizados para revisão
 * manual, nunca convertidos em lançamentos.
 */
export function conciliarRecebimentosConvenio(
  lotes: ReadonlyArray<LoteConciliacao>,
  lancamentos: ReadonlyArray<LancamentoConvenio>,
) {
  const lancadoPorLote = new Map<string, number>();
  for (const l of lancamentos) {
    if (!l.lote_tiss_id || !realizado(l.status)) continue;
    const sinal = l.tipo === 'receita' ? 1 : l.tipo === 'despesa' && l.categoria === 'ajuste_convenio' ? -1 : 0;
    lancadoPorLote.set(l.lote_tiss_id, (lancadoPorLote.get(l.lote_tiss_id) ?? 0) + sinal * emCentavos(valorRealizado(l)));
  }

  const porLote = lotes.map((lote) => {
    const declarado = emCentavos(lote.valor_pago);
    const lancado = lancadoPorLote.get(lote.id) ?? 0;
    const diferenca = declarado - lancado;
    const situacao: SituacaoConciliacao = diferenca === 0 ? 'conciliado' : diferenca > 0 ? 'recebido_sem_lancamento' : 'lancado_acima_do_retorno';
    return { id: lote.id, numero_lote: lote.numero_lote, convenio: lote.convenio_nome, declarado: declarado / 100, lancado: lancado / 100, diferenca: diferenca / 100, situacao, centavos: diferenca };
  });

  const semCorrespondencia = lancamentos
    .filter((l) => !l.lote_tiss_id && realizado(l.status) && ehRecebimentoConvenio(l))
    .map((l) => {
      const valor = emCentavos(valorRealizado(l));
      return {
        id: l.id,
        descricao: l.descricao,
        data: l.data,
        valor: valor / 100,
        sugestoes: porLote.filter((lote) => lote.centavos === valor).map((lote) => lote.id),
      };
    });

  return { lotes: porLote.map(({ centavos: _centavos, ...lote }) => lote), semCorrespondencia };
}
