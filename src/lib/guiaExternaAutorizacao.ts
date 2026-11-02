import { daysBetweenDateOnly } from '@/lib/dateOnly';

export type SituacaoAutorizacao = 'sem_validade' | 'vigente' | 'vencendo' | 'vencida';

/** Dias de antecedência para avisar que a autorização do convênio vai vencer. */
export const DIAS_AVISO_AUTORIZACAO = 5;

/** Validade é data de calendário (yyyy-MM-dd), comparada com o dia de São Paulo. */
export function situacaoAutorizacao(validade: string | null | undefined, hoje: string): { situacao: SituacaoAutorizacao; dias: number | null } {
  const data = (validade ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { situacao: 'sem_validade', dias: null };
  const dias = daysBetweenDateOnly(hoje, data);
  if (dias < 0) return { situacao: 'vencida', dias };
  if (dias <= DIAS_AVISO_AUTORIZACAO) return { situacao: 'vencendo', dias };
  return { situacao: 'vigente', dias };
}

export function rotuloAutorizacao(situacao: SituacaoAutorizacao, dias: number | null): string | null {
  if (situacao === 'vencida') return 'Autorização vencida';
  if (situacao === 'vencendo') return dias === 0 ? 'Autorização vence hoje' : `Autorização vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  return null;
}

/** Guias ainda em atendimento: só elas precisam do aviso. */
export const STATUS_GUIA_EM_ATENDIMENTO = new Set(['recebida', 'em_analise', 'agendada']);
