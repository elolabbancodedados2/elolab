/**
 * Recibo de pagamento de uma conta a receber.
 *
 * O texto é montado por funções puras (testáveis); o PDF só carrega o jsPDF
 * quando alguém pede o recibo.
 */
import { dataHoraSP } from '@/lib/caixaFormatacao';
import { emCentavos, formatarMoeda } from '@/lib/dinheiro';
import { rotuloFormaPagamento } from '@/lib/financeiroRotulos';

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze',
  'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto < 20) {
    if (resto) partes.push(UNIDADES[resto]);
  } else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
  }
  return partes.join(' e ');
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero';
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (milhoes) partes.push(milhoes === 1 ? 'um milhão' : `${ate999(milhoes)} milhões`);
  if (milhares) partes.push(milhares === 1 ? 'mil' : `${ate999(milhares)} mil`);
  if (resto) partes.push(ate999(resto));
  if (partes.length === 1) return partes[0];
  // "e" antes do último grupo quando ele é menor que 100 ou centena redonda.
  const ultimo = partes.pop()!;
  const ligaComE = resto > 0 && (resto < 100 || resto % 100 === 0);
  return `${partes.join(' ')}${ligaComE ? ' e ' : ' '}${ultimo}`;
}

/** Valor em reais por extenso: 1234,56 → "mil duzentos e trinta e quatro reais e cinquenta e seis centavos". */
export function valorPorExtenso(valor: number): string {
  const centavosTotais = Math.abs(emCentavos(valor));
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  if (reais >= 1_000_000_000) return formatarMoeda(valor);
  const partes: string[] = [];
  if (reais > 0) {
    const redondoEmMilhao = reais % 1_000_000 === 0;
    partes.push(`${inteiroPorExtenso(reais)}${redondoEmMilhao ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  return partes.length ? partes.join(' e ') : 'zero real';
}

export interface DadosRecibo {
  clinica: { nome: string; cnpj?: string; endereco?: string; telefone?: string };
  pagador: string;
  descricao: string;
  pagamentos: Array<{ id: string; valor: number; forma_pagamento: string; data_pagamento: string }>;
  numero: string;
}

export interface Recibo {
  titulo: string;
  numero: string;
  total: number;
  corpo: string;
  itens: string[];
  emitente: string;
}

/** Texto do recibo, só com pagamentos ativos (os estornados ficam de fora). */
export function montarRecibo(dados: DadosRecibo): Recibo {
  const total = dados.pagamentos.reduce((soma, p) => soma + emCentavos(p.valor), 0) / 100;
  const emitente = dados.clinica.nome || 'a clínica';
  return {
    titulo: 'Recibo',
    numero: dados.numero,
    total,
    corpo: `Recebemos de ${dados.pagador} a importância de ${formatarMoeda(total)} (${valorPorExtenso(total)}), referente a ${dados.descricao}.`,
    itens: dados.pagamentos.map(p => `${dataHoraSP(p.data_pagamento)} · ${rotuloFormaPagamento(p.forma_pagamento)} · ${formatarMoeda(p.valor)}`),
    emitente,
  };
}

/** Gera o PDF do recibo e oferece o download. */
export async function baixarReciboPdf(dados: DadosRecibo): Promise<void> {
  const recibo = montarRecibo(dados);
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'mm', format: 'a5' });
  const largura = doc.internal.pageSize.getWidth();
  const margem = 14;
  let y = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(recibo.emitente, margem, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const contato = [dados.clinica.cnpj && `CNPJ ${dados.clinica.cnpj}`, dados.clinica.telefone, dados.clinica.endereco].filter(Boolean).join(' · ');
  if (contato) { y += 5; doc.text(doc.splitTextToSize(contato, largura - margem * 2), margem, y); }
  y += 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`${recibo.titulo} nº ${recibo.numero}`, margem, y);
  doc.text(formatarMoeda(recibo.total), largura - margem, y, { align: 'right' });
  y += 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const linhas = doc.splitTextToSize(recibo.corpo, largura - margem * 2);
  doc.text(linhas, margem, y);
  y += linhas.length * 5 + 4;
  doc.setFontSize(9);
  doc.text('Pagamentos:', margem, y);
  for (const item of recibo.itens) { y += 5; doc.text(`• ${item}`, margem + 2, y); }
  y += 20;
  doc.line(margem + 20, y, largura - margem - 20, y);
  y += 5;
  doc.text(recibo.emitente, largura / 2, y, { align: 'center' });
  doc.save(`recibo-${recibo.numero}.pdf`);
}
