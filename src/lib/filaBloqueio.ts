export type ExplicacaoBloqueioFila = {
  motivo: string;
  resolve: string;
  /** Quem pode liberar excepcionalmente; nulo quando a liberação não se aplica. */
  liberacao: string | null;
};

/** Perfis aceitos pelo trigger `restringir_liberacao_excepcional`. */
export const PERFIS_LIBERACAO_EXCEPCIONAL = ['admin', 'medico'] as const;

const LIBERACAO = 'Liberação excepcional: médico ou administrador, com justificativa registrada.';

export function explicarBloqueioFila(input: {
  tipo: 'pagamento' | 'triagem';
  cobrancaEstado?: string | null;
  erroRegras?: boolean;
  verificando?: boolean;
  erroVerificacao?: boolean;
}): ExplicacaoBloqueioFila {
  if (input.erroRegras) {
    return {
      motivo: 'As regras de liberação da clínica não carregaram.',
      resolve: 'Atualize a fila; o atendimento fica bloqueado até a confirmação.',
      liberacao: null,
    };
  }
  if (input.tipo === 'triagem') {
    return {
      motivo: 'Triagem obrigatória ainda não registrada.',
      resolve: 'Enfermagem, médico ou administrador registra os sinais vitais em Triagem.',
      liberacao: LIBERACAO,
    };
  }
  if (input.cobrancaEstado === 'pendente') {
    return {
      motivo: 'Cobrança do check-in ainda não confirmada.',
      resolve: 'A recepção confirma a cobrança em Recepção → Balcão.',
      liberacao: null,
    };
  }
  if (input.erroVerificacao) {
    return {
      motivo: 'Não foi possível validar o pagamento agora.',
      resolve: 'Atualize a fila para validar novamente.',
      liberacao: LIBERACAO,
    };
  }
  if (input.verificando) {
    return {
      motivo: 'Verificando o pagamento.',
      resolve: 'Aguarde a confirmação do servidor.',
      liberacao: LIBERACAO,
    };
  }
  return {
    motivo: 'Pagamento pendente.',
    resolve: 'A recepção registra o pagamento em Recepção → Balcão.',
    liberacao: LIBERACAO,
  };
}
