/**
 * PDF Receipt/Cupom generator using jsPDF
 * Replaces all text/HTML-based receipt generation
 */
// Tipo apenas; o runtime entra por import() em buildPdf. O cupom é impresso
// no balcão, mas a biblioteca não precisa vir junto com a tela do caixa.
import type jsPDF from 'jspdf';

export interface ReceiptData {
  titulo?: string;
  dataHora: string;
  docId?: string;
  paciente: string;
  cpf?: string;
  medico?: string;
  especialidade?: string;
  descricao: string;
  categoria?: string;
  formaPagamento: string;
  valorOriginal: number;
  desconto?: number;
  acrescimo?: number;
  valorFinal: number;
  operador?: string;
}

async function buildPdf(data: ReceiptData): Promise<jsPDF> {
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'mm', format: [80, 160] }); // thermal receipt size
  const w = 80;
  const margin = 6;
  const contentW = w - margin * 2;
  let y = 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(data.titulo || 'COMPROVANTE DE PAGAMENTO', w / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('EloLab — Sistema Clínico', w / 2, y, { align: 'center' });
  y += 4;

  // Dashed line
  doc.setLineDashPattern([1, 1], 0);
  doc.setLineWidth(0.3);
  doc.line(margin, y, w - margin, y);
  y += 5;

  doc.setFontSize(8);

  const addRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', 'normal');
    doc.text(label, margin, y);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const maxW = contentW - doc.getTextWidth(label) - 2;
    const trimmed = value.length > 30 ? value.slice(0, 28) + '…' : value;
    doc.text(trimmed, w - margin, y, { align: 'right' });
    y += 4.5;
  };

  addRow('Data:', data.dataHora);
  if (data.docId) addRow('Nº Doc:', data.docId);

  doc.line(margin, y, w - margin, y);
  y += 4;

  addRow('Paciente:', data.paciente, true);
  if (data.cpf) addRow('CPF:', data.cpf);

  doc.line(margin, y, w - margin, y);
  y += 4;

  if (data.medico) addRow('Médico:', data.medico);
  if (data.especialidade) addRow('Especialidade:', data.especialidade);
  addRow('Descrição:', data.descricao);
  if (data.categoria) addRow('Categoria:', data.categoria);
  addRow('Forma Pgto:', data.formaPagamento);

  doc.line(margin, y, w - margin, y);
  y += 4;

  addRow('Valor original:', `R$ ${data.valorOriginal.toFixed(2)}`);
  if (data.desconto && data.desconto > 0) {
    doc.setTextColor(22, 163, 74);
    addRow('Desconto:', `- R$ ${data.desconto.toFixed(2)}`);
    doc.setTextColor(0);
  }
  if (data.acrescimo && data.acrescimo > 0) {
    doc.setTextColor(220, 38, 38);
    addRow('Acréscimo:', `+ R$ ${data.acrescimo.toFixed(2)}`);
    doc.setTextColor(0);
  }

  // Total
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([], 0);
  doc.line(margin, y, w - margin, y);
  y += 5;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL PAGO:', margin, y);
  doc.text(`R$ ${data.valorFinal.toFixed(2)}`, w - margin, y, { align: 'right' });
  y += 6;

  doc.setLineDashPattern([1, 1], 0);
  doc.setLineWidth(0.3);
  doc.line(margin, y, w - margin, y);
  y += 5;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  if (data.operador) {
    doc.text(`Recebido por: ${data.operador}`, w / 2, y, { align: 'center' });
    y += 3.5;
  }
  doc.text('Documento sem valor fiscal', w / 2, y, { align: 'center' });
  y += 3;
  doc.text('Obrigado pela preferência!', w / 2, y, { align: 'center' });
  doc.setTextColor(0);

  return doc;
}

/** Download receipt as PDF */
export async function downloadReceiptPdf(data: ReceiptData) {
  const doc = await buildPdf(data);
  const safeName = data.paciente.replace(/\s+/g, '_').slice(0, 30);
  const safeDate = data.dataHora.replace(/[\s/:]/g, '-').slice(0, 10);
  doc.save(`comprovante_${safeName}_${safeDate}.pdf`);
}

/** Open receipt PDF in new tab for printing */
export async function printReceiptPdf(data: ReceiptData) {
  const doc = await buildPdf(data);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (w) {
    w.onload = () => w.print();
  }
}

/** Get WhatsApp-formatted text for receipt */
export function getReceiptWhatsAppText(data: ReceiptData): string {
  return [
    '📋 *CUPOM DE RECEBIMENTO*',
    `📅 ${data.dataHora}`,
    '',
    `👤 Paciente: ${data.paciente}`,
    data.cpf ? `🪪 CPF: ${data.cpf}` : '',
    data.medico ? `🩺 Médico: ${data.medico}` : '',
    data.especialidade ? `📋 Especialidade: ${data.especialidade}` : '',
    `📝 ${data.descricao}`,
    data.categoria ? `📂 ${data.categoria}` : '',
    `💳 ${data.formaPagamento}`,
    '',
    `💰 Valor: R$ ${data.valorOriginal.toFixed(2)}`,
    data.desconto && data.desconto > 0 ? `🟢 Desconto: - R$ ${data.desconto.toFixed(2)}` : '',
    data.acrescimo && data.acrescimo > 0 ? `🔴 Acréscimo: + R$ ${data.acrescimo.toFixed(2)}` : '',
    `✅ *TOTAL PAGO: R$ ${data.valorFinal.toFixed(2)}*`,
    '',
    data.operador ? `Recebido por: ${data.operador}` : '',
    '_Documento sem valor fiscal_',
  ].filter(Boolean).join('\n');
}
