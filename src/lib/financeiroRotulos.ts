/**
 * Rótulos do módulo financeiro (categorias, status, formas de pagamento,
 * centros de custo e frequências) num lugar só.
 *
 * Cada tela tinha a própria tabela: "Folha Pagamento" no painel, "Folha de
 * Pagamento" nas contas e "Folha de pagamento" na DRE. Além do texto
 * diferente, uma categoria gravada como "Outros" virava uma segunda linha ao
 * lado de "outros". Aqui a chave é normalizada antes de procurar o rótulo.
 */

export interface OpcaoRotulo {
  value: string;
  label: string;
}

export const CATEGORIAS_RECEITA: ReadonlyArray<OpcaoRotulo> = [
  { value: 'consulta', label: 'Consulta médica' },
  { value: 'retorno', label: 'Retorno' },
  { value: 'procedimento', label: 'Procedimento' },
  { value: 'exame', label: 'Exame / diagnóstico' },
  { value: 'cirurgia', label: 'Cirurgia / intervenção' },
  { value: 'internacao', label: 'Internação' },
  { value: 'taxa_administrativa', label: 'Taxa administrativa' },
  { value: 'taxa_material', label: 'Taxa de material' },
  { value: 'convenio_repasse', label: 'Repasse de convênio' },
  { value: 'honorario_medico', label: 'Honorário médico' },
  { value: 'fisioterapia', label: 'Fisioterapia' },
  { value: 'psicologia', label: 'Psicologia' },
  { value: 'pediatria', label: 'Pediatria' },
  { value: 'outros', label: 'Outros' },
];

export const CATEGORIAS_DESPESA: ReadonlyArray<OpcaoRotulo> = [
  { value: 'fornecedores', label: 'Fornecedores' },
  { value: 'folha_pagamento', label: 'Folha de pagamento' },
  { value: 'impostos', label: 'Impostos' },
  { value: 'aluguel', label: 'Aluguel' },
  { value: 'servicos', label: 'Serviços' },
  { value: 'equipamentos', label: 'Equipamentos' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'outros', label: 'Outros' },
];

/** Rótulos no plural, usados em totais e gráficos. */
const ROTULO_CATEGORIA: Record<string, string> = {
  consulta: 'Consultas', retorno: 'Retornos', procedimento: 'Procedimentos',
  exame: 'Exames', cirurgia: 'Cirurgias', internacao: 'Internações',
  taxa_administrativa: 'Taxas administrativas', taxa_material: 'Taxas de material',
  convenio_repasse: 'Repasse de convênio', honorario_medico: 'Honorários',
  fisioterapia: 'Fisioterapia', psicologia: 'Psicologia', pediatria: 'Pediatria',
  fornecedores: 'Fornecedores', folha_pagamento: 'Folha de pagamento',
  impostos: 'Impostos', aluguel: 'Aluguel', servicos: 'Serviços',
  equipamentos: 'Equipamentos', marketing: 'Marketing', outros: 'Outros',
  receita_caixa: 'Receitas avulsas', sangria: 'Sangrias', suprimento: 'Suprimentos',
  ajuste_convenio: 'Ajustes de convênio',
};

/** Chave canônica: minúsculas, sem espaços nas pontas, vazio vira "outros". */
export function normalizarCategoria(categoria: string | null | undefined): string {
  const chave = String(categoria ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  return chave || 'outros';
}

/** Rótulo de uma categoria; chave desconhecida vira texto legível. */
export function rotuloCategoria(categoria: string | null | undefined): string {
  const chave = normalizarCategoria(categoria);
  const conhecido = ROTULO_CATEGORIA[chave];
  if (conhecido) return conhecido;
  const texto = chave.replace(/_/g, ' ');
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1);
}

/** Rótulo no singular, como aparece no cadastro da conta. */
export function rotuloCategoriaCadastro(tipo: 'receita' | 'despesa', categoria: string | null | undefined): string {
  const chave = normalizarCategoria(categoria);
  const lista = tipo === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;
  return lista.find(item => item.value === chave)?.label ?? rotuloCategoria(chave);
}

/** Soma valores por categoria normalizada, do maior para o menor. */
export function somarPorCategoria(
  itens: ReadonlyArray<{ categoria: string | null | undefined; valor: number }>,
): Array<{ cat: string; label: string; valor: number }> {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    const chave = normalizarCategoria(item.categoria);
    mapa.set(chave, (mapa.get(chave) ?? 0) + item.valor);
  }
  return [...mapa.entries()]
    .map(([cat, valor]) => ({ cat, label: rotuloCategoria(cat), valor }))
    .sort((a, b) => b.valor - a.valor);
}

export const STATUS_RECEITA: Record<string, string> = {
  pendente: 'Pendente', parcial: 'Parcial', pago: 'Recebido', atrasado: 'Atrasado',
  cancelado: 'Cancelado', estornado: 'Estornado',
};

export const STATUS_DESPESA: Record<string, string> = {
  pendente: 'Pendente', parcial: 'Parcial', pago: 'Pago', atrasado: 'Atrasado',
  cancelado: 'Cancelado', estornado: 'Estornado',
};

export const FORMAS_PAGAMENTO: ReadonlyArray<OpcaoRotulo> = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'cartao_debito', label: 'Cartão de débito' },
  { value: 'convenio', label: 'Convênio' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'cheque', label: 'Cheque' },
];

/** Formas aceitas para pagar uma despesa. */
export const FORMAS_PAGAMENTO_DESPESA: ReadonlyArray<OpcaoRotulo> = FORMAS_PAGAMENTO
  .filter(forma => ['pix', 'boleto', 'transferencia', 'cartao_credito', 'cartao_debito', 'dinheiro'].includes(forma.value));

const ROTULO_FORMA: Record<string, string> = {
  ...Object.fromEntries(FORMAS_PAGAMENTO.map(forma => [forma.value, forma.label])),
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
};

export function rotuloFormaPagamento(forma: string | null | undefined): string {
  if (!forma) return '—';
  return ROTULO_FORMA[forma] ?? forma.replace(/_/g, ' ');
}

/** O RPC `registrar_pagamento` grava cartão como "credito"/"debito". */
export function formaPagamentoParaRpc(forma: string): string {
  if (forma === 'cartao_credito') return 'credito';
  if (forma === 'cartao_debito') return 'debito';
  return forma;
}

/** Caminho inverso de `formaPagamentoParaRpc`, para agrupar por forma. */
export function formaPagamentoCanonica(forma: string | null | undefined): string {
  if (forma === 'credito') return 'cartao_credito';
  if (forma === 'debito') return 'cartao_debito';
  return forma || 'outros';
}

export const CENTROS_CUSTO_RECEITA: ReadonlyArray<OpcaoRotulo> = [
  { value: 'geral', label: 'Geral' },
  { value: 'ambulatorio', label: 'Ambulatório' },
  { value: 'laboratorio', label: 'Laboratório' },
  { value: 'centro_cirurgico', label: 'Centro cirúrgico' },
  { value: 'estetica', label: 'Estética' },
  { value: 'odonto', label: 'Odontologia' },
  { value: 'fisioterapia', label: 'Fisioterapia' },
];

export const CENTROS_CUSTO_DESPESA: ReadonlyArray<OpcaoRotulo> = [
  { value: 'geral', label: 'Geral' },
  { value: 'matriz', label: 'Unidade matriz' },
  { value: 'filial', label: 'Unidade filial' },
  { value: 'estetica', label: 'Estética' },
  { value: 'odonto', label: 'Odontologia' },
  { value: 'laboratorio', label: 'Laboratório' },
  { value: 'administrativo', label: 'Administrativo' },
];

const ROTULO_CENTRO_CUSTO: Record<string, string> = Object.fromEntries(
  [...CENTROS_CUSTO_RECEITA, ...CENTROS_CUSTO_DESPESA].map(item => [item.value, item.label]),
);

export function rotuloCentroCusto(centro: string | null | undefined): string {
  if (!centro || !centro.trim()) return 'Sem centro de custo';
  const chave = centro.trim();
  return ROTULO_CENTRO_CUSTO[chave] ?? chave.replace(/_/g, ' ');
}

export const FREQUENCIAS_RECORRENCIA: ReadonlyArray<OpcaoRotulo> = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'anual', label: 'Anual' },
];

export function rotuloFrequencia(frequencia: string | null | undefined): string {
  return FREQUENCIAS_RECORRENCIA.find(item => item.value === frequencia)?.label ?? 'Frequência não definida';
}
