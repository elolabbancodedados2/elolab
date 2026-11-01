import type jsPDF from 'jspdf';
import { formatCsvCell } from '@/lib/csv';
import { emCentavos } from '@/lib/dinheiro';
import { formatarDataCurta, STATUS_REPASSE_LABEL } from '@/lib/tissStatus';

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
  /** Data do recebimento que originou o repasse e o paciente atendido. */
  lancamentos?: { status?: string | null; data?: string | null } | null;
  paciente_nome?: string | null;
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

const STATUS_REPASSE = STATUS_REPASSE_LABEL;

/** Percentual no formato brasileiro: 12,5%. */
export const percentualBr = (valor: number) => `${(Number(valor) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

const regraDoRepasse = (r: RepasseDemonstrativo) => r.tipo_calculo === 'fixo'
  ? `Fixo ${(Number(r.valor_configurado ?? r.valor_repasse) || 0).toFixed(2).replace('.', ',')}`
  : percentualBr(r.percentual);

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
  linhas.push(['Médico', 'CRM', 'Data', 'Paciente', 'Regra', 'Base', 'Repasse', 'Status', 'Conta no devido'].map(formatCsvCell).join(';'));
  for (const r of repasses) {
    linhas.push([
      formatCsvCell(r.medicos?.nome || r.medicos?.crm || 'Médico não identificado'),
      formatCsvCell(r.medicos?.crm ?? ''),
      formatCsvCell(r.lancamentos?.data ? formatarDataCurta(r.lancamentos.data) : ''),
      formatCsvCell(r.paciente_nome ?? ''),
      formatCsvCell(regraDoRepasse(r)),
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

/** Itens de um médico na ordem do demonstrativo: data do recebimento, depois paciente. */
export function itensDoMedico(repasses: ReadonlyArray<RepasseDemonstrativo>, medicoId: string): RepasseDemonstrativo[] {
  return repasses
    .filter(r => (r.medico_id || r.medicos?.crm || 'sem-medico') === medicoId)
    .sort((a, b) => String(a.lancamentos?.data ?? '').localeCompare(String(b.lancamentos?.data ?? ''))
      || String(a.paciente_nome ?? '').localeCompare(String(b.paciente_nome ?? ''), 'pt-BR'));
}

const brl = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);

/** Demonstrativo em PDF de um médico na competência, para entregar ao profissional. */
export async function baixarDemonstrativoMedicoPdf(
  repasses: ReadonlyArray<RepasseDemonstrativo>,
  competencia: string,
  medicoId: string,
  valido: (repasse: RepasseDemonstrativo) => boolean,
): Promise<void> {
  const { default: JsPDF } = await import('jspdf');
  const doc: jsPDF = new JsPDF({ unit: 'mm', format: 'a4' });
  const itens = itensDoMedico(repasses, medicoId);
  const subtotal = subtotaisPorMedico(itens, valido)[0];
  const nome = itens[0]?.medicos?.nome || itens[0]?.medicos?.crm || 'Médico';
  const margem = 15;
  let y = 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Demonstrativo de repasses', margem, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${nome}${itens[0]?.medicos?.crm ? ` · CRM ${itens[0].medicos.crm}` : ''} · competência ${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`, margem, y);
  y += 10;
  const colunas = [margem, margem + 24, margem + 84, margem + 112, margem + 140, margem + 165];
  doc.setFont('helvetica', 'bold');
  ['Data', 'Paciente', 'Regra', 'Base', 'Repasse', 'Status'].forEach((t, i) => doc.text(t, colunas[i], y));
  doc.setFont('helvetica', 'normal');
  y += 6;
  for (const r of itens) {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.text(r.lancamentos?.data ? formatarDataCurta(r.lancamentos.data) : '—', colunas[0], y);
    doc.text(String(r.paciente_nome ?? '—').slice(0, 32), colunas[1], y);
    doc.text(regraDoRepasse(r), colunas[2], y);
    doc.text(brl(r.valor_base), colunas[3], y);
    doc.text(brl(r.valor_repasse), colunas[4], y);
    doc.text(STATUS_REPASSE[r.status] ?? r.status, colunas[5], y);
    y += 6;
  }
  y += 6;
  if (subtotal) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Devido: ${brl(subtotal.devido)} · Pago: ${brl(subtotal.pago)} · Em aberto: ${brl(subtotal.emAberto)}`, margem, y);
  }
  doc.save(`demonstrativo-repasses-${competencia}-${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.pdf`);
}
