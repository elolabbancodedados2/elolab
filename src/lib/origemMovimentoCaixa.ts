/**
 * Origem de uma movimentação listada no Caixa diário.
 *
 * O RPC `movimentos_caixa_diario` (migration 20261011410000) une dois blocos:
 *  1. pagamentos (`origem_pagamento = true`): baixas de contas a receber e a pagar,
 *     feitas pelas telas próprias (ex.: `registrar_pagamento`);
 *  2. lançamentos pagos sem linha em `pagamentos` (`origem_pagamento = false`).
 *
 * O bloco 2 mistura o que o próprio caixa grava com o que outros módulos gravam:
 *  - CashOperationPage: `tipo` sangria/suprimento (categoria igual ao tipo) e
 *    `tipo = 'despesa'` com uma das categorias fixas de CATEGORIAS_DESPESA_CAIXA;
 *  - repasse médico (20261008350000): `tipo = 'despesa'`, `categoria = 'honorario_medico'`;
 *  - retorno TISS (20261008370000): `categoria = 'convenio_repasse'` (receita) ou
 *    `'ajuste_convenio'` (despesa), sempre com `lote_tiss_id`.
 *
 * Critério adotado: lista de permissão. Só é "do caixa" (e pode ser editado ou
 * excluído no caixa) o lançamento sem pagamento vinculado cujo tipo seja
 * sangria/suprimento, ou despesa com categoria da lista abaixo. Qualquer outra
 * combinação é tratada como de outro módulo, mesmo que a categoria seja nova.
 */

/** Mantenha igual a CATEGORIAS_DESPESA de src/pages/CashOperationPage.tsx (há teste que confere). */
export const CATEGORIAS_DESPESA_CAIXA = [
  'Material de escritório', 'Limpeza', 'Alimentação', 'Transporte', 'Manutenção', 'Fornecedor', 'Troco', 'Outros',
] as const;

export interface MovimentoCaixaOrigemInput {
  tipo: string;
  categoria?: string | null;
  origem_pagamento?: boolean | null;
}

export interface OrigemExterna {
  rotulo: string;
  descricao: string;
  /** Tela onde o lançamento deve ser corrigido, quando existir. */
  rota: string | null;
}

export function ehMovimentoDoCaixa(movimento: MovimentoCaixaOrigemInput): boolean {
  if (movimento.origem_pagamento) return false;
  if (movimento.tipo === 'sangria' || movimento.tipo === 'suprimento') return true;
  if (movimento.tipo !== 'despesa') return false;
  return (CATEGORIAS_DESPESA_CAIXA as readonly string[]).includes(movimento.categoria ?? '');
}

/** Para movimentos que não são do caixa, diz de onde vieram e onde corrigir. */
export function origemExternaDoMovimento(movimento: MovimentoCaixaOrigemInput): OrigemExterna | null {
  if (ehMovimentoDoCaixa(movimento)) return null;
  if (movimento.categoria === 'honorario_medico') {
    return { rotulo: 'Repasse', descricao: 'Pagamento de repasse médico', rota: '/repasses-medicos' };
  }
  if (movimento.categoria === 'convenio_repasse' || movimento.categoria === 'ajuste_convenio') {
    return { rotulo: 'Convênio', descricao: 'Retorno de lote TISS', rota: '/faturamento-convenios' };
  }
  if (movimento.origem_pagamento) {
    return movimento.tipo === 'despesa'
      ? { rotulo: 'Contas a pagar', descricao: 'Baixa de conta a pagar', rota: '/contas?tab=pagar' }
      : { rotulo: 'Recebimento', descricao: 'Baixa de conta a receber', rota: null };
  }
  if (movimento.tipo === 'receita') return null;
  return { rotulo: 'Financeiro', descricao: 'Lançamento de outro módulo', rota: '/financeiro' };
}
