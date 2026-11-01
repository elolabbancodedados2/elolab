/**
 * Documento do pedido de compra: texto para WhatsApp/e-mail, PDF, previsão
 * de entrega e variação de preço. O pedido precisa sair do sistema para o
 * fornecedor; antes ele só existia na tela.
 */
import { dateOnlyInTimeZone } from '@/lib/dateOnly';
import { numeroPedidoCompra } from '@/lib/compras';

export interface PedidoDocumento {
  id: string;
  total: number | string;
  created_at: string;
  fornecedores?: { nome: string } | null;
  pedido_compra_itens: Array<{ descricao: string; quantidade: number; preco_unitario: number | string }>;
}

const moeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Soma `dias` a uma data civil (AAAA-MM-DD) sem depender do fuso do aparelho. */
export function somarDias(data: string, dias: number): string {
  const base = Date.parse(`${data}T12:00:00Z`);
  return new Date(base + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Data prevista = dia da emissão (fuso da clínica) + maior prazo cotado. */
export function previsaoEntrega(emitidoEm: string | null | undefined, prazoDias: number | null | undefined): string | null {
  if (!emitidoEm || prazoDias == null || !Number.isFinite(prazoDias) || prazoDias < 0) return null;
  const instante = new Date(emitidoEm);
  if (!Number.isFinite(instante.getTime())) return null;
  return somarDias(dateOnlyInTimeZone(instante, 'America/Sao_Paulo'), Math.round(prazoDias));
}

export function pedidoAtrasado(previsao: string | null, status: string, hoje: string): boolean {
  return status === 'emitido' && !!previsao && previsao < hoje;
}

/** Variação em % do preço novo sobre o último pago. null sem base de comparação. */
export function variacaoPercentual(atual: number | null, anterior: number | null | undefined): number | null {
  if (atual === null || anterior == null || !(anterior > 0)) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

export function textoVariacao(variacao: number | null): string | null {
  if (variacao === null) return null;
  if (variacao === 0) return 'mesmo preço da última compra';
  return `${variacao > 0 ? '+' : ''}${String(variacao).replace('.', ',')}% sobre a última compra`;
}

/** Texto do pedido para colar no WhatsApp ou no corpo do e-mail. */
export function textoPedidoCompra(pedido: PedidoDocumento, opcoes: { clinica?: string; previsao?: string | null } = {}): string {
  const numero = numeroPedidoCompra(pedido.id);
  const linhas = pedido.pedido_compra_itens.map(i => {
    const preco = Number(i.preco_unitario);
    return `• ${i.quantidade} × ${i.descricao} — ${moeda(preco)} (subtotal ${moeda(Math.round(i.quantidade * preco * 100) / 100)})`;
  });
  return [
    `Pedido de compra nº ${numero}${opcoes.clinica ? ` — ${opcoes.clinica}` : ''}`,
    pedido.fornecedores?.nome ? `Fornecedor: ${pedido.fornecedores.nome}` : null,
    `Emitido em ${dataBr(dateOnlyInTimeZone(new Date(pedido.created_at), 'America/Sao_Paulo'))}`,
    opcoes.previsao ? `Entrega prevista: ${dataBr(opcoes.previsao)}` : null,
    '',
    ...linhas,
    '',
    `Total: ${moeda(Number(pedido.total) || 0)}`,
    'Por favor, confirme o recebimento deste pedido e o prazo de entrega.',
  ].filter(l => l !== null).join('\n');
}

export function linkEmailPedido(email: string | null | undefined, pedido: PedidoDocumento, texto: string): string {
  const assunto = `Pedido de compra nº ${numeroPedidoCompra(pedido.id)}`;
  return `mailto:${encodeURIComponent(email ?? '')}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;
}

/** Gera e baixa o PDF do pedido (jsPDF carregado só ao clicar). */
export async function baixarPdfPedidoCompra(pedido: PedidoDocumento, opcoes: { clinica?: string; previsao?: string | null } = {}) {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new JsPDF();
  const numero = numeroPedidoCompra(pedido.id);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`Pedido de compra nº ${numero}`, 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const cabecalho = [
    opcoes.clinica ? `Clínica: ${opcoes.clinica}` : null,
    pedido.fornecedores?.nome ? `Fornecedor: ${pedido.fornecedores.nome}` : null,
    `Emitido em ${dataBr(dateOnlyInTimeZone(new Date(pedido.created_at), 'America/Sao_Paulo'))}`,
    opcoes.previsao ? `Entrega prevista: ${dataBr(opcoes.previsao)}` : null,
  ].filter((l): l is string => !!l);
  cabecalho.forEach((linha, i) => doc.text(linha, 14, 26 + i * 6));
  (autoTable as unknown as (d: unknown, o: unknown) => void)(doc, {
    startY: 30 + cabecalho.length * 6,
    head: [['Item', 'Quantidade', 'Preço unitário', 'Subtotal']],
    body: pedido.pedido_compra_itens.map(i => {
      const preco = Number(i.preco_unitario);
      return [i.descricao, String(i.quantidade), moeda(preco), moeda(Math.round(i.quantidade * preco * 100) / 100)];
    }),
    foot: [['', '', 'Total', moeda(Number(pedido.total) || 0)]],
    theme: 'grid',
    headStyles: { fillColor: [17, 17, 17] },
    footStyles: { fillColor: [240, 240, 240], textColor: [17, 17, 17] },
  });
  doc.save(`pedido-compra-${numero}.pdf`);
}
