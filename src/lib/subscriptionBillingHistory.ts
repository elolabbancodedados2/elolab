export interface EventoCobrancaAssinatura {
  id: string;
  origem: 'cartao_assinatura' | 'pix_periodo' | 'fatura_recorrente' | string;
  referencia: string | null;
  metodo: string | null;
  valor: number | null;
  status: string;
  detalhe: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
}

const TIPOS: Record<string, string> = {
  cartao_assinatura: 'Assinatura no cartão',
  pix_periodo: 'Pix (período)',
  fatura_recorrente: 'Fatura recorrente',
};

// Estados da cobrança SaaS (local e do Mercado Pago) e se ainda podem mudar.
const ESTADOS: Record<string, [string, boolean]> = {
  ativa: ['Ativa', true], cancelada: ['Cancelada', true], pausada: ['Pausada', false], pendente: ['Pendente', false],
  criando: ['Gerando', false], aguardando_pagamento: ['Aguardando pagamento', false], em_processamento: ['Em processamento', false],
  pago: ['Pago', true], recusado: ['Recusado', true], cancelado: ['Cancelado', true], expirado: ['Expirado', true],
  estornado: ['Estornado', true], erro: ['Não gerado', true],
  approved: ['Pago', true], authorized: ['Autorizado', false], pending: ['Pendente', false], in_process: ['Em processamento', false],
  rejected: ['Recusado', true], cancelled: ['Cancelado', true], refunded: ['Estornado', true], charged_back: ['Contestado', true],
  in_mediation: ['Em disputa', false], scheduled: ['Agendada', false], processed: ['Processada', true],
};

const DETALHES: Record<string, string> = {
  recusado: 'Cartão recusado',
  dados_invalidos: 'Dados do cartão inválidos',
  falha_comunicacao: 'Sem resposta do Mercado Pago',
  valor_divergente: 'Valor pago diferente do cobrado',
};

export function descreverEventoCobranca(evento: Pick<EventoCobrancaAssinatura, 'origem' | 'status' | 'detalhe'>) {
  const [estado, final] = ESTADOS[evento.status] ?? [evento.status, false];
  return {
    tipo: TIPOS[evento.origem] ?? evento.origem,
    estado,
    final,
    detalhe: evento.detalhe ? DETALHES[evento.detalhe] ?? evento.detalhe : null,
  };
}
