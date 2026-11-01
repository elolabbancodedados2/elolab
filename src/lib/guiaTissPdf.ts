/**
 * Espelho imprimível de uma guia do lote TISS (Consulta ou SP/SADT).
 *
 * Não substitui o formulário oficial da operadora: serve para conferência,
 * arquivo e assinatura do beneficiário. O jsPDF entra por import() para não
 * pesar no carregamento da tela.
 */
import type jsPDF from 'jspdf';
import { formatarCompetencia, formatarDataCurta } from '@/lib/tissStatus';

export interface GuiaParaImpressao {
  numero_guia: string;
  numero_carteira: string | null;
  data_atendimento: string;
  codigo_procedimento: string;
  tipo_servico: string;
  quantidade: number;
  valor_total: number;
}

export interface LoteParaImpressao {
  numero_lote: string;
  competencia: string;
  versao_tiss: string | null;
  convenios: { nome: string; registro_ans: string | null } | null;
}

export interface AutorizacaoParaImpressao {
  numero_autorizacao: string | null;
  paciente_nome: string | null;
}

export type ModeloGuia = 'consulta' | 'sp_sadt';

/** Consulta usa a guia de consulta; os demais serviços usam a SP/SADT. */
export const modeloDaGuia = (tipoServico: string): ModeloGuia => tipoServico === 'consulta' ? 'consulta' : 'sp_sadt';

const brl = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);

export function camposGuiaTiss(guia: GuiaParaImpressao, lote: LoteParaImpressao, autorizacao?: AutorizacaoParaImpressao | null) {
  const modelo = modeloDaGuia(guia.tipo_servico);
  return {
    modelo,
    titulo: modelo === 'consulta' ? 'Guia de consulta' : 'Guia de SP/SADT',
    campos: [
      { rotulo: 'Registro ANS', valor: lote.convenios?.registro_ans || '—' },
      { rotulo: 'Operadora', valor: lote.convenios?.nome || '—' },
      { rotulo: 'Número da guia no prestador', valor: guia.numero_guia },
      { rotulo: 'Lote', valor: `${lote.numero_lote} · competência ${formatarCompetencia(lote.competencia)}` },
      { rotulo: 'Versão TISS', valor: lote.versao_tiss || '—' },
      { rotulo: 'Número da carteira', valor: guia.numero_carteira || '—' },
      { rotulo: 'Beneficiário', valor: autorizacao?.paciente_nome || '—' },
      { rotulo: 'Senha / autorização', valor: autorizacao?.numero_autorizacao || '—' },
      { rotulo: 'Data do atendimento', valor: formatarDataCurta(guia.data_atendimento) },
      { rotulo: 'Código do procedimento (TUSS)', valor: guia.codigo_procedimento },
      { rotulo: 'Quantidade', valor: String(guia.quantidade) },
      { rotulo: 'Valor total', valor: brl(guia.valor_total) },
    ],
  };
}

async function montarPdf(guia: GuiaParaImpressao, lote: LoteParaImpressao, autorizacao?: AutorizacaoParaImpressao | null): Promise<jsPDF> {
  const { default: JsPDF } = await import('jspdf');
  const { titulo, campos } = camposGuiaTiss(guia, lote, autorizacao);
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const margem = 15;
  const largura = 210 - margem * 2;
  let y = 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(titulo, margem, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Espelho para conferência. Não substitui o formulário oficial da operadora.', margem, y);
  y += 8;
  doc.setLineWidth(0.2);
  for (const campo of campos) {
    doc.rect(margem, y, largura, 10);
    doc.setFontSize(7);
    doc.text(campo.rotulo, margem + 2, y + 3.5);
    doc.setFontSize(10);
    doc.text(String(campo.valor), margem + 2, y + 8);
    y += 10;
  }
  y += 18;
  doc.line(margem, y, margem + 80, y);
  doc.line(margem + 100, y, margem + largura, y);
  doc.setFontSize(8);
  doc.text('Assinatura do beneficiário', margem, y + 4);
  doc.text('Assinatura e carimbo do profissional', margem + 100, y + 4);
  return doc;
}

export async function baixarGuiaTissPdf(guia: GuiaParaImpressao, lote: LoteParaImpressao, autorizacao?: AutorizacaoParaImpressao | null) {
  const doc = await montarPdf(guia, lote, autorizacao);
  doc.save(`guia-${lote.numero_lote}-${guia.numero_guia}.pdf`);
}
