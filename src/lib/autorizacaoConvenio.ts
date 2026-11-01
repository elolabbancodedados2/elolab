/**
 * Resposta da operadora a um pedido de autorização e fila central de
 * autorizações do faturamento.
 *
 * Status aceitos pelo banco: pendente, autorizada, negada, expirada.
 */
import { daysBetweenDateOnly, isValidDateOnly } from '@/lib/dateOnly';

export type DecisaoAutorizacao = 'autorizada' | 'negada';

export interface RespostaAutorizacaoEntrada {
  decisao: DecisaoAutorizacao;
  senha: string;
  validade: string;
  observacao: string;
  hoje: string;
}

export interface RespostaAutorizacaoPayload {
  status: DecisaoAutorizacao;
  numero_autorizacao: string | null;
  data_autorizacao: string | null;
  data_expiracao: string | null;
  observacoes: string | null;
}

export function montarRespostaAutorizacao(
  entrada: RespostaAutorizacaoEntrada,
  agoraIso: string = new Date().toISOString(),
): { payload: RespostaAutorizacaoPayload; erro?: undefined } | { erro: string; payload?: undefined } {
  const senha = entrada.senha.trim();
  const observacao = entrada.observacao.trim();
  if (entrada.decisao === 'autorizada') {
    if (!senha) return { erro: 'Informe a senha ou o número da autorização enviado pela operadora.' };
    if (senha.length > 40) return { erro: 'A senha da autorização tem no máximo 40 caracteres.' };
    if (entrada.validade && (!isValidDateOnly(entrada.validade) || entrada.validade < entrada.hoje)) {
      return { erro: 'A validade precisa ser uma data a partir de hoje.' };
    }
    return {
      payload: {
        status: 'autorizada',
        numero_autorizacao: senha,
        data_autorizacao: agoraIso,
        data_expiracao: entrada.validade || null,
        observacoes: observacao || null,
      },
    };
  }
  if (observacao.length < 5) return { erro: 'Registre o motivo da negativa informado pela operadora (mínimo 5 caracteres).' };
  return {
    payload: {
      status: 'negada',
      numero_autorizacao: senha || null,
      data_autorizacao: null,
      data_expiracao: null,
      observacoes: observacao,
    },
  };
}

export interface AutorizacaoFila {
  id: string;
  status: string;
  data_expiracao: string | null;
}

export interface FilaAutorizacoes<T extends AutorizacaoFila> {
  pendentes: T[];
  vencendo: T[];
  vencidas: T[];
  negadas: T[];
}

/** Dias de antecedência para considerar uma autorização "vencendo". */
export const DIAS_AVISO_VENCIMENTO = 7;

export function classificarAutorizacoes<T extends AutorizacaoFila>(
  autorizacoes: ReadonlyArray<T>,
  hoje: string,
  diasAviso = DIAS_AVISO_VENCIMENTO,
): FilaAutorizacoes<T> {
  const fila: FilaAutorizacoes<T> = { pendentes: [], vencendo: [], vencidas: [], negadas: [] };
  for (const item of autorizacoes) {
    if (item.status === 'pendente') fila.pendentes.push(item);
    else if (item.status === 'negada') fila.negadas.push(item);
    else if (item.status === 'autorizada' && item.data_expiracao && isValidDateOnly(item.data_expiracao.slice(0, 10))) {
      const dias = daysBetweenDateOnly(hoje, item.data_expiracao.slice(0, 10));
      if (dias < 0) fila.vencidas.push(item);
      else if (dias <= diasAviso) fila.vencendo.push(item);
    }
  }
  return fila;
}
