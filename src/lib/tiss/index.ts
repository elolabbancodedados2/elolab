import type { GuiaLote, LoteValidacao } from '../tissLoteValidacao';

type GuiaBaseTiss = Omit<GuiaLote, 'tipo_servico'> & { tipo_servico: string };

export type GuiaConsultaTiss = GuiaBaseTiss & { tipo_guia: 'consulta' };
export type GuiaSadtTiss = GuiaBaseTiss & { tipo_guia: 'sp_sadt' };
export type GuiaTiss = GuiaConsultaTiss | GuiaSadtTiss;

export interface LoteTiss {
  lote: LoteValidacao;
  registro_ans: string;
  guias: GuiaTiss[];
}

export interface XmlLoteTiss {
  xml: string;
  hash: string;
}

const escapeXml = (value: string | number | null) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Rascunho XML determinístico. Não é validado nem deve ser transmitido como TISS. */
export function gerarXmlLoteTiss(lote: LoteTiss): string {
  const guias = lote.guias.map((guia) => `<guia tipo="${guia.tipo_guia}"><numero>${escapeXml(guia.numero_guia)}</numero><carteira>${escapeXml(guia.numero_carteira)}</carteira><dataAtendimento>${escapeXml(guia.data_atendimento)}</dataAtendimento><codigoProcedimento>${escapeXml(guia.codigo_procedimento)}</codigoProcedimento><tipoServico>${escapeXml(guia.tipo_servico)}</tipoServico><quantidade>${escapeXml(guia.quantidade)}</quantidade><valor>${guia.valor_total.toFixed(2)}</valor></guia>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<loteTissRascunho versao="${escapeXml(lote.lote.versao_tiss)}"><registroANS>${escapeXml(lote.registro_ans)}</registroANS><numeroLote>${escapeXml(lote.lote.numero_lote)}</numeroLote><competencia>${escapeXml(lote.lote.competencia)}</competencia><quantidadeGuias>${escapeXml(lote.lote.quantidade_guias)}</quantidadeGuias><valorApresentado>${lote.lote.valor_apresentado.toFixed(2)}</valorApresentado><guias>${guias}</guias></loteTissRascunho>`;
}

export async function hashLoteTiss(lote: LoteTiss): Promise<string> {
  const bytes = new TextEncoder().encode(gerarXmlLoteTiss(lote));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function gerarLoteTiss(lote: LoteTiss): Promise<XmlLoteTiss> {
  return { xml: gerarXmlLoteTiss(lote), hash: await hashLoteTiss(lote) };
}
