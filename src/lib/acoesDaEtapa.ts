export type AcaoEtapa = 'agendar_retorno' | 'checkin' | 'a_caminho' | 'falta' | 'receber' | 'receber_saldo' | 'chamar_balcao' | 'retomar_cobranca' | 'triagem' | 'chamar' | 'iniciar' | 'finalizar' | 'concluir' | 'reagendar' | 'retornos' | 'exames' | 'prontuario' | 'fila' | 'whatsapp_reagendar';

interface ItemEtapa {
  ag: { status: string };
  step: number;
  fila?: { id: string; cobranca_estado?: string | null } | null;
  saldo: number;
  atrasado?: boolean;
  temTelefone?: boolean;
  podeTriagem?: boolean;
  faltaTriagem?: boolean;
}

/** A mesma decisão alimenta quadro, lista e linha do tempo. */
export function acoesDaEtapa(item: ItemEtapa): { principal: AcaoEtapa | null; secundarias: AcaoEtapa[] } {
  const secundarias: AcaoEtapa[] = [];
  if (item.ag.status === 'faltou') return { principal: 'reagendar', secundarias: item.temTelefone ? ['whatsapp_reagendar'] : [] };
  if (item.step === 0) {
    if (item.atrasado && item.temTelefone) secundarias.push('a_caminho');
    if (item.atrasado) secundarias.push('falta');
    return { principal: 'checkin', secundarias };
  }
  if (item.step === 1) {
    if (item.podeTriagem) secundarias.push('triagem');
    if (item.fila?.cobranca_estado === 'pendente') secundarias.push('retomar_cobranca');
    if (item.saldo > 0) secundarias.push('chamar_balcao');
    return { principal: item.saldo > 0 ? 'receber' : 'chamar_balcao', secundarias };
  }
  if (item.step === 2) {
    if (!item.fila) return { principal: 'fila', secundarias };
    if (item.ag.status === 'em_atendimento') return { principal: 'finalizar', secundarias };
    secundarias.push('chamar');
    if (item.faltaTriagem) return { principal: item.podeTriagem ? 'triagem' : 'fila', secundarias };
    if (item.podeTriagem) secundarias.push('triagem');
    return { principal: 'iniciar', secundarias };
  }
  if (item.step === 3) return { principal: item.saldo > 0 ? 'receber_saldo' : item.fila ? 'concluir' : 'fila', secundarias: ['reagendar', 'retornos', 'exames', 'prontuario'] };
  if (item.step === 4) return { principal: 'agendar_retorno', secundarias: ['exames'] };
  return { principal: null, secundarias };
}
