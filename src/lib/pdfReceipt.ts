import { formatCurrency } from '@/lib/formatters';
import { toast } from 'sonner';
import { valorPorExtenso } from '@/lib/dinheiro';
/**
 * Cupom de 80 mm em PDF (jsPDF): comprovante de pagamento, de estorno, de
 * sangria e recibo para reembolso do plano de saúde.
 */
// Tipo apenas; o runtime entra por import() em buildPdf. O cupom é impresso
// no balcão, mas a biblioteca não precisa vir junto com a tela do caixa.
import type jsPDF from 'jspdf';

export interface ReceiptData {
  titulo?: string;
  /** 'pagamento' (padrão), 'estorno', 'sangria' ou 'reembolso'. */
  modelo?: 'pagamento' | 'estorno' | 'sangria' | 'reembolso';
  dataHora: string;
  docId?: string;
  paciente?: string;
  cpf?: string;
  medico?: string;
  medicoRegistro?: string;
  especialidade?: string;
  clinicaNome?: string;
  clinicaCnpj?: string;
  descricao: string;
  categoria?: string;
  formaPagamento: string;
  valorOriginal: number;
  desconto?: number;
  acrescimo?: number;
  valorFinal: number;
  /** Recibo parcial: quanto já tinha sido pago antes deste recebimento. */
  jaPagoAntes?: number;
  /** Recibo parcial: quanto continua em aberto depois deste recebimento. */
  saldoRestante?: number;
  /** Pagamento em dinheiro com troco. */
  valorEntregue?: number;
  troco?: number;
  destino?: string;
  operador?: string;
}

export type LinhaRecibo =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'subtitulo'; texto: string }
  | { tipo: 'linha'; rotulo: string; valor: string; negrito?: boolean; cor?: 'positivo' | 'negativo' }
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'separador'; forte?: boolean }
  | { tipo: 'total'; rotulo: string; valor: string }
  | { tipo: 'rodape'; texto: string }
  | { tipo: 'assinatura'; texto: string };

/** "CRM 12345/SP" a partir do cadastro do médico (tipo_registro, crm, crm_uf). */
export function registroProfissional(medico: { crm?: string | null; tipo_registro?: string | null; crm_uf?: string | null } | null | undefined): string | undefined {
  if (!medico?.crm) return undefined;
  return `${medico.tipo_registro || 'CRM'} ${medico.crm}${medico.crm_uf ? `/${medico.crm_uf}` : ''}`;
}

const TITULOS: Record<NonNullable<ReceiptData['modelo']>, string> = {
  pagamento: 'COMPROVANTE DE PAGAMENTO',
  estorno: 'COMPROVANTE DE ESTORNO',
  sangria: 'COMPROVANTE DE SANGRIA',
  reembolso: 'RECIBO',
};

/** Conteúdo do cupom, sem desenho: é o que os testes conferem. */
export function montarLinhasRecibo(data: ReceiptData): LinhaRecibo[] {
  const modelo = data.modelo ?? 'pagamento';
  const linhas: LinhaRecibo[] = [];
  linhas.push({ tipo: 'titulo', texto: data.titulo || TITULOS[modelo] });
  linhas.push({ tipo: 'subtitulo', texto: data.clinicaNome || 'EloLab — Sistema Clínico' });
  if (data.clinicaCnpj) linhas.push({ tipo: 'subtitulo', texto: `CNPJ ${data.clinicaCnpj}` });
  linhas.push({ tipo: 'separador' });
  linhas.push({ tipo: 'linha', rotulo: 'Data:', valor: data.dataHora });
  if (data.docId) linhas.push({ tipo: 'linha', rotulo: 'Nº Doc:', valor: data.docId });

  if (modelo === 'reembolso') {
    linhas.push({ tipo: 'separador' });
    linhas.push({
      tipo: 'paragrafo',
      texto: `Recebi de ${data.paciente || '—'}${data.cpf ? `, CPF ${data.cpf}` : ''}, a importância de ${formatCurrency(data.valorFinal)} (${valorPorExtenso(data.valorFinal)}), referente a ${data.descricao}.`,
    });
    linhas.push({ tipo: 'separador' });
    if (data.medico) linhas.push({ tipo: 'linha', rotulo: 'Profissional:', valor: data.medico });
    if (data.medicoRegistro) linhas.push({ tipo: 'linha', rotulo: 'Registro:', valor: data.medicoRegistro });
    if (data.especialidade) linhas.push({ tipo: 'linha', rotulo: 'Especialidade:', valor: data.especialidade });
    linhas.push({ tipo: 'linha', rotulo: 'Forma Pgto:', valor: data.formaPagamento });
    linhas.push({ tipo: 'separador', forte: true });
    linhas.push({ tipo: 'total', rotulo: 'VALOR:', valor: formatCurrency(data.valorFinal) });
    linhas.push({ tipo: 'separador' });
    linhas.push({ tipo: 'assinatura', texto: data.clinicaNome || 'Assinatura do responsável' });
    if (data.operador) linhas.push({ tipo: 'rodape', texto: `Emitido por: ${data.operador}` });
    linhas.push({ tipo: 'rodape', texto: 'Recibo para solicitação de reembolso' });
    return linhas;
  }

  if (data.paciente) {
    linhas.push({ tipo: 'separador' });
    linhas.push({ tipo: 'linha', rotulo: 'Paciente:', valor: data.paciente, negrito: true });
    if (data.cpf) linhas.push({ tipo: 'linha', rotulo: 'CPF:', valor: data.cpf });
  }

  linhas.push({ tipo: 'separador' });
  if (data.medico) linhas.push({ tipo: 'linha', rotulo: 'Médico:', valor: data.medico });
  if (data.especialidade) linhas.push({ tipo: 'linha', rotulo: 'Especialidade:', valor: data.especialidade });
  linhas.push({ tipo: 'linha', rotulo: modelo === 'sangria' ? 'Motivo:' : 'Descrição:', valor: data.descricao });
  if (data.destino) linhas.push({ tipo: 'linha', rotulo: 'Destino:', valor: data.destino });
  if (data.categoria) linhas.push({ tipo: 'linha', rotulo: 'Categoria:', valor: data.categoria });
  linhas.push({ tipo: 'linha', rotulo: 'Forma Pgto:', valor: data.formaPagamento });

  linhas.push({ tipo: 'separador' });
  if (modelo !== 'sangria') linhas.push({ tipo: 'linha', rotulo: 'Valor original:', valor: formatCurrency(data.valorOriginal) });
  if (data.desconto && data.desconto > 0) linhas.push({ tipo: 'linha', rotulo: 'Desconto:', valor: `- ${formatCurrency(data.desconto)}`, cor: 'positivo' });
  if (data.acrescimo && data.acrescimo > 0) linhas.push({ tipo: 'linha', rotulo: 'Acréscimo:', valor: `+ ${formatCurrency(data.acrescimo)}`, cor: 'negativo' });
  if (data.jaPagoAntes && data.jaPagoAntes > 0) linhas.push({ tipo: 'linha', rotulo: 'Já pago antes:', valor: formatCurrency(data.jaPagoAntes) });

  linhas.push({ tipo: 'separador', forte: true });
  const rotuloTotal = modelo === 'estorno' ? 'TOTAL ESTORNADO:' : modelo === 'sangria' ? 'VALOR RETIRADO:' : 'TOTAL PAGO:';
  linhas.push({ tipo: 'total', rotulo: rotuloTotal, valor: formatCurrency(data.valorFinal) });
  if (data.valorEntregue && data.valorEntregue > 0) {
    linhas.push({ tipo: 'linha', rotulo: 'Valor entregue:', valor: formatCurrency(data.valorEntregue) });
    linhas.push({ tipo: 'linha', rotulo: 'Troco:', valor: formatCurrency(data.troco ?? 0) });
  }
  if (data.saldoRestante !== undefined && data.saldoRestante > 0) {
    linhas.push({ tipo: 'linha', rotulo: 'Saldo em aberto:', valor: formatCurrency(data.saldoRestante), negrito: true });
  }
  linhas.push({ tipo: 'separador' });
  if (modelo === 'sangria') linhas.push({ tipo: 'assinatura', texto: 'Responsável pela retirada' });
  if (data.operador) linhas.push({ tipo: 'rodape', texto: `${modelo === 'sangria' ? 'Registrado' : modelo === 'estorno' ? 'Estornado' : 'Recebido'} por: ${data.operador}` });
  linhas.push({ tipo: 'rodape', texto: 'Documento sem valor fiscal' });
  if (modelo === 'pagamento') linhas.push({ tipo: 'rodape', texto: 'Obrigado pela preferência!' });
  return linhas;
}

const LARGURA = 80;
const MARGEM = 6;

/**
 * Desenha as linhas. Com `desenhar = false` só mede: o cupom tem altura
 * dinâmica, então a primeira passada calcula quanto papel o texto ocupa.
 */
function desenhar(doc: jsPDF, linhas: LinhaRecibo[], desenhar: boolean): number {
  const contentW = LARGURA - MARGEM * 2;
  let y = 10;
  const texto = (t: string | string[], x: number, opcoes?: Parameters<jsPDF['text']>[3]) => { if (desenhar) doc.text(t, x, y, opcoes); };
  const linha = () => { if (desenhar) doc.line(MARGEM, y, LARGURA - MARGEM, y); };

  for (const item of linhas) {
    switch (item.tipo) {
      case 'titulo':
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
        texto(item.texto, LARGURA / 2, { align: 'center' });
        y += 5;
        break;
      case 'subtitulo':
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        texto(item.texto, LARGURA / 2, { align: 'center' });
        y += 3.5;
        break;
      case 'separador':
        if (desenhar) {
          doc.setLineDashPattern(item.forte ? [] : [1, 1], 0);
          doc.setLineWidth(item.forte ? 0.5 : 0.3);
        }
        y += 1;
        linha();
        y += 4;
        break;
      case 'linha': {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        const larguraRotulo = doc.getTextWidth(item.rotulo) + 2;
        texto(item.rotulo, MARGEM);
        doc.setFont('helvetica', item.negrito ? 'bold' : 'normal');
        if (desenhar && item.cor === 'positivo') doc.setTextColor(22, 163, 74);
        if (desenhar && item.cor === 'negativo') doc.setTextColor(220, 38, 38);
        // Texto longo quebra em várias linhas alinhadas à direita, sem cortar.
        const partes = doc.splitTextToSize(item.valor || '—', Math.max(20, contentW - larguraRotulo)) as string[];
        partes.forEach((parte, indice) => {
          texto(parte, LARGURA - MARGEM, { align: 'right' });
          if (indice < partes.length - 1) y += 3.6;
        });
        if (desenhar && item.cor) doc.setTextColor(0);
        y += 4.5;
        break;
      }
      case 'paragrafo': {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        const partes = doc.splitTextToSize(item.texto, contentW) as string[];
        partes.forEach(parte => { texto(parte, MARGEM); y += 3.8; });
        y += 1;
        break;
      }
      case 'total':
        doc.setFontSize(11); doc.setFont('helvetica', 'bold');
        texto(item.rotulo, MARGEM);
        texto(item.valor, LARGURA - MARGEM, { align: 'right' });
        y += 6;
        break;
      case 'assinatura':
        y += 8;
        if (desenhar) { doc.setLineDashPattern([], 0); doc.setLineWidth(0.3); doc.line(MARGEM + 8, y, LARGURA - MARGEM - 8, y); }
        y += 3.5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        texto(item.texto, LARGURA / 2, { align: 'center' });
        y += 5;
        break;
      case 'rodape': {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        if (desenhar) doc.setTextColor(120);
        const partes = doc.splitTextToSize(item.texto, contentW) as string[];
        partes.forEach(parte => { texto(parte, LARGURA / 2, { align: 'center' }); y += 3.2; });
        if (desenhar) doc.setTextColor(0);
        break;
      }
    }
  }
  return y + 6;
}

async function buildPdf(data: ReceiptData): Promise<jsPDF> {
  const { default: JsPDF } = await import('jspdf');
  const linhas = montarLinhasRecibo(data);
  const medida = new JsPDF({ unit: 'mm', format: [LARGURA, 300] });
  const altura = Math.max(100, Math.ceil(desenhar(medida, linhas, false)));
  const doc = new JsPDF({ unit: 'mm', format: [LARGURA, altura] });
  desenhar(doc, linhas, true);
  return doc;
}

function nomeArquivo(data: ReceiptData): string {
  const prefixo = data.modelo === 'reembolso' ? 'recibo' : data.modelo === 'estorno' ? 'estorno' : data.modelo === 'sangria' ? 'sangria' : 'comprovante';
  const nome = (data.paciente || data.descricao || 'caixa').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').slice(0, 30);
  const dataArquivo = data.dataHora.replace(/[\s/:,]+/g, '-').slice(0, 10);
  return `${prefixo}_${nome}_${dataArquivo}.pdf`;
}

/** Download receipt as PDF */
export async function downloadReceiptPdf(data: ReceiptData) {
  const doc = await buildPdf(data);
  doc.save(nomeArquivo(data));
}

/**
 * Abre o cupom numa aba para imprimir. Devolve false quando o navegador
 * bloqueia a aba (o PDF é gerado de forma assíncrona e a abertura pode perder
 * o gesto do clique): a tela então oferece um botão para tentar de novo.
 */
export async function printReceiptPdf(data: ReceiptData): Promise<boolean> {
  const doc = await buildPdf(data);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    URL.revokeObjectURL(url);
    return false;
  }
  w.onload = () => w.print();
  // A aba já carregou o PDF; um minuto basta para liberar a memória do blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/**
 * Imprime e, se o navegador bloquear a aba, avisa com um botão
 * "Imprimir comprovante" — o clique no botão é um gesto novo e o navegador libera.
 */
export async function imprimirReciboComAviso(data: ReceiptData): Promise<boolean> {
  try {
    const aberto = await printReceiptPdf(data);
    if (!aberto) {
      toast.warning('O navegador bloqueou a janela do comprovante.', {
        description: 'Clique para abrir de novo ou permita pop-ups para este site.',
        duration: 15_000,
        action: { label: 'Imprimir comprovante', onClick: () => { void printReceiptPdf(data); } },
      });
    }
    return aberto;
  } catch {
    toast.error('Não foi possível gerar o comprovante.');
    return false;
  }
}

/** Get WhatsApp-formatted text for receipt */
export function getReceiptWhatsAppText(data: ReceiptData): string {
  const titulo = data.titulo || TITULOS[data.modelo ?? 'pagamento'];
  return [
    `*${titulo}*`,
    data.clinicaNome ? data.clinicaNome : '',
    `Data: ${data.dataHora}`,
    '',
    data.paciente ? `Paciente: ${data.paciente}` : '',
    data.cpf ? `CPF: ${data.cpf}` : '',
    data.medico ? `Médico: ${data.medico}` : '',
    data.especialidade ? `Especialidade: ${data.especialidade}` : '',
    `Descrição: ${data.descricao}`,
    data.categoria ? `Categoria: ${data.categoria}` : '',
    `Forma de pagamento: ${data.formaPagamento}`,
    '',
    data.valorOriginal !== data.valorFinal ? `Valor: ${formatCurrency(data.valorOriginal)}` : '',
    data.desconto && data.desconto > 0 ? `Desconto: - ${formatCurrency(data.desconto)}` : '',
    data.acrescimo && data.acrescimo > 0 ? `Acréscimo: + ${formatCurrency(data.acrescimo)}` : '',
    `*${data.modelo === 'estorno' ? 'Total estornado' : 'Total pago'}: ${formatCurrency(data.valorFinal)}*`,
    data.saldoRestante && data.saldoRestante > 0 ? `Saldo em aberto: ${formatCurrency(data.saldoRestante)}` : '',
    '',
    data.operador ? `Recebido por: ${data.operador}` : '',
    '_Documento sem valor fiscal_',
  ].filter(Boolean).join('\n');
}
