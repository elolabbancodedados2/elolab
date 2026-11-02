/**
 * Prazo legal para atender o pedido de acesso do titular.
 *
 * LGPD, art. 19, II: a declaração clara e completa deve ser fornecida em até
 * 15 dias a partir do requerimento. Contamos em dias corridos no calendário de
 * São Paulo, que é como a clínica enxerga o pedido.
 */
import { daysBetweenDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';

export const PRAZO_LGPD_DIAS = 15;

export interface PrazoLgpd {
  /** Último dia do prazo (YYYY-MM-DD). */
  limite: string;
  /** Dias até o limite; negativo quando venceu. */
  diasRestantes: number;
  situacao: 'no_prazo' | 'vence_em_breve' | 'vencido';
  texto: string;
}

function somarDias(data: string, dias: number): string {
  const base = new Date(`${data}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

export function prazoLegalLgpd(requestedAt: string, agora: Date = new Date()): PrazoLgpd | null {
  const instante = new Date(requestedAt);
  if (!Number.isFinite(instante.getTime())) return null;
  const pedido = todaySaoPauloDateOnly(instante);
  const limite = somarDias(pedido, PRAZO_LGPD_DIAS);
  const diasRestantes = daysBetweenDateOnly(todaySaoPauloDateOnly(agora), limite);
  const [ano, mes, dia] = limite.split('-');
  const dataLimite = `${dia}/${mes}/${ano}`;
  if (diasRestantes < 0) {
    const atraso = -diasRestantes;
    return { limite, diasRestantes, situacao: 'vencido', texto: `Prazo legal vencido há ${atraso} ${atraso === 1 ? 'dia' : 'dias'} (${dataLimite})` };
  }
  if (diasRestantes === 0) return { limite, diasRestantes, situacao: 'vence_em_breve', texto: `Prazo legal termina hoje (${dataLimite})` };
  return {
    limite,
    diasRestantes,
    situacao: diasRestantes <= 3 ? 'vence_em_breve' : 'no_prazo',
    texto: `Prazo legal até ${dataLimite} · ${diasRestantes} ${diasRestantes === 1 ? 'dia' : 'dias'}`,
  };
}
