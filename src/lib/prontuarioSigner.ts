export interface IdentificacaoAssinanteInput {
  assinado: boolean;
  assinado_por?: string | null;
  crm_assinante?: string | null;
  medicoVinculado?: { nome?: string | null; crm?: string | null } | null;
}

export function obterIdentificacaoAssinante(input: IdentificacaoAssinanteInput) {
  if (input.assinado) {
    return {
      nome: input.assinado_por?.trim() || 'Assinante não identificado',
      crm: input.crm_assinante?.trim() || undefined,
    };
  }

  return {
    nome: input.medicoVinculado?.nome?.trim() || 'Médico',
    crm: input.medicoVinculado?.crm?.trim() || undefined,
  };
}
