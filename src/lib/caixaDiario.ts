const MENSAGENS_CAIXA: Record<string, string> = {
  sem_permissao: 'Seu perfil não pode realizar esta operação no caixa.',
  valor_invalido: 'Informe um valor válido, maior ou igual a zero e com até duas casas decimais.',
  caixa_existente: 'Já existe um caixa registrado para hoje. Atualize a tela para conferir o estado.',
  caixa_inexistente: 'Este caixa não existe para esta clínica ou período. Atualize a tela e tente novamente.',
  ja_fechado: 'Este caixa já foi fechado em outra sessão. Atualize a tela para conferir.',
  ja_aberto: 'Este caixa já está aberto. Atualize a tela para conferir.',
  motivo_divergencia_obrigatorio: 'Descreva a diferença entre o valor contado e o saldo esperado (mínimo 5 caracteres).',
  motivo_invalido: 'Explique por que o caixa precisa ser reaberto (mínimo 10 caracteres).',
};

const CODIGOS_SUCESSO = new Set(['aberto', 'fechado', 'reaberto']);

export type MovimentoCaixa = {
  tipo: 'receita' | 'despesa' | 'sangria' | 'suprimento';
  valor: number;
  forma_pagamento?: string | null;
};

export function calcularTotaisCaixa(valorAbertura: number, movimentos: MovimentoCaixa[]) {
  const soma = (tipo: MovimentoCaixa['tipo']) => movimentos
    .filter(movimento => movimento.tipo === tipo)
    .reduce((total, movimento) => total + (Number.isFinite(movimento.valor) ? movimento.valor : 0), 0);
  const receita = soma('receita');
  const despesa = soma('despesa');
  const sangria = soma('sangria');
  const suprimento = soma('suprimento');
  const liquido = receita - despesa - sangria + suprimento;
  return { receita, despesa, sangria, suprimento, liquido, final: valorAbertura + liquido };
}

export function calcularSaldoGaveta(valorAbertura: number, movimentos: MovimentoCaixa[]): number {
  const dinheiro = movimentos.filter(movimento => movimento.forma_pagamento === 'dinheiro');
  return valorAbertura + dinheiro.reduce((saldo, movimento) => {
    const valor = Number.isFinite(movimento.valor) ? movimento.valor : 0;
    return saldo + ((movimento.tipo === 'receita' || movimento.tipo === 'suprimento') ? valor : -valor);
  }, 0);
}

export function validarResultadoRpcCaixa(resultado: unknown): void {
  if (!resultado || typeof resultado !== 'object' || !('code' in resultado)) {
    throw new Error('O servidor não confirmou a operação do caixa. Atualize a tela antes de continuar.');
  }
  const code = String((resultado as { code: unknown }).code);
  if (CODIGOS_SUCESSO.has(code)) return;
  throw new Error(MENSAGENS_CAIXA[code] || 'Não foi possível atualizar o caixa. Atualize a tela e tente novamente.');
}
