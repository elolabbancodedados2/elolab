import { formatCsvCell } from '@/lib/csv';
import { emCentavos } from '@/lib/dinheiro';

export interface RepasseDemonstrativo {
  id: string;
  medico_id?: string | null;
  valor_base: number;
  valor_repasse: number;
  percentual: number;
  tipo_calculo: 'percentual' | 'fixo';
  valor_configurado: number | null;
  status: string;
  medicos?: { nome: string | null; crm: string } | null;
}

export interface SubtotalMedico {
  medicoId: string;
  nome: string;
  crm: string;
  quantidade: number;
  base: number;
  devido: number;
  pago: number;
  emAberto: number;
}

const STATUS_REPASSE: Record<string, string> = {
  pendente: 'Pendente', aprovado: 'Aprovado', pago: 'Pago', cancelado: 'Cancelado',
};

const reais = (centavos: number) => centavos / 100;
const numeroCsv = (valor: number) => `"${valor.toFixed(2).replace('.', ',')}"`;

/**
 * Subtotais por médico. `valido` diz se o repasse conta no devido (receita de
 * origem quitada ou já pago), a mesma regra dos indicadores da tela.
 */
export function subtotaisPorMedico(
  repasses: ReadonlyArray<RepasseDemonstrativo>,
  valido: (repasse: RepasseDemonstrativo) => boolean,
): SubtotalMedico[] {
  const grupos = new Map<string, { nome: string; crm: string; quantidade: number; base: number; devido: number; pago: number }>();
  for (const r of repasses) {
    if (r.status === 'cancelado') continue;
    const chave = r.medico_id || r.medicos?.crm || 'sem-medico';
    const atual = grupos.get(chave) ?? { nome: r.medicos?.nome || r.medicos?.crm || 'Médico não identificado', crm: r.medicos?.crm ?? '', quantidade: 0, base: 0, devido: 0, pago: 0 };
    atual.quantidade += 1;
    if (valido(r)) {
      atual.base += emCentavos(Number(r.valor_base) || 0);
      atual.devido += emCentavos(Number(r.valor_repasse) || 0);
    }
    if (r.status === 'pago') atual.pago += emCentavos(Number(r.valor_repasse) || 0);
    grupos.set(chave, atual);
  }
  return [...grupos.entries()]
    .map(([medicoId, g]) => ({
      medicoId, nome: g.nome, crm: g.crm, quantidade: g.quantidade,
      base: reais(g.base), devido: reais(g.devido), pago: reais(g.pago), emAberto: reais(Math.max(0, g.devido - g.pago)),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Demonstrativo da competência em CSV (separador ";"), com itens e subtotais por médico. */
export function demonstrativoRepassesCsv(
  repasses: ReadonlyArray<RepasseDemonstrativo>,
  competencia: string,
  valido: (repasse: RepasseDemonstrativo) => boolean,
): string {
  const linhas: string[] = [];
  linhas.push([formatCsvCell('Demonstrativo de repasses médicos'), formatCsvCell(`Competência ${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`)].join(';'));
  linhas.push('');
  linhas.push(['Médico', 'CRM', 'Regra', 'Base', 'Repasse', 'Status', 'Conta no devido'].map(formatCsvCell).join(';'));
  for (const r of repasses) {
    const regra = r.tipo_calculo === 'fixo'
      ? `Fixo ${(Number(r.valor_configurado ?? r.valor_repasse) || 0).toFixed(2).replace('.', ',')}`
      : `${Number(r.percentual) || 0}%`;
    linhas.push([
      formatCsvCell(r.medicos?.nome || r.medicos?.crm || 'Médico não identificado'),
      formatCsvCell(r.medicos?.crm ?? ''),
      formatCsvCell(regra),
      numeroCsv(Number(r.valor_base) || 0),
      numeroCsv(Number(r.valor_repasse) || 0),
      formatCsvCell(STATUS_REPASSE[r.status] ?? r.status),
      formatCsvCell(r.status !== 'cancelado' && valido(r) ? 'Sim' : 'Não'),
    ].join(';'));
  }
  linhas.push('');
  linhas.push(['Subtotal por médico', 'CRM', 'Itens', 'Base', 'Devido', 'Pago', 'Em aberto'].map(formatCsvCell).join(';'));
  for (const s of subtotaisPorMedico(repasses, valido)) {
    linhas.push([
      formatCsvCell(s.nome), formatCsvCell(s.crm), formatCsvCell(String(s.quantidade)),
      numeroCsv(s.base), numeroCsv(s.devido), numeroCsv(s.pago), numeroCsv(s.emAberto),
    ].join(';'));
  }
  return linhas.join('\r\n');
}
