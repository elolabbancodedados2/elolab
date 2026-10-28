import { emCentavos } from '@/lib/dinheiro';
import { valorRealizado } from '@/lib/lancamentos';

export interface TransacaoExtrato { fitid: string; data: string; valor: number; descricao: string }

const ENTIDADES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
const decodificar = (v: string) => v.replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTIDADES[e]).trim();

/** Valor de uma tag OFX; funciona em SGML (sem fechamento) e em XML. */
function tag(bloco: string, nome: string): string | null {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'));
  return m ? decodificar(m[1]) : null;
}

/**
 * Lê extrato OFX (SGML ou XML). shortcut: CSV de banco não é aceito; cada
 * banco usa colunas próprias — adicionar leitor quando houver layout definido.
 */
export function lerOfx(texto: string): { conta: string; transacoes: TransacaoExtrato[] } {
  const conta = [tag(texto, 'BANKID'), tag(texto, 'ACCTID')].filter(Boolean).join('-') || 'conta-sem-identificacao';
  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi) ?? [];
  const transacoes = blocos.flatMap((bloco) => {
    const fitid = tag(bloco, 'FITID');
    const data = tag(bloco, 'DTPOSTED')?.match(/^(\d{4})(\d{2})(\d{2})/);
    const valor = Number((tag(bloco, 'TRNAMT') ?? '').replace(',', '.'));
    if (!fitid || !data || !Number.isFinite(valor) || (tag(bloco, 'TRNAMT') ?? '') === '') return [];
    return [{ fitid, data: `${data[1]}-${data[2]}-${data[3]}`, valor: emCentavos(valor) / 100, descricao: tag(bloco, 'MEMO') || tag(bloco, 'NAME') || '' }];
  });
  if (transacoes.length === 0) throw new Error('Nenhuma transação encontrada. Envie um extrato no formato OFX.');
  return { conta, transacoes };
}

export interface LancamentoConferencia {
  id: string;
  tipo: string;
  descricao: string | null;
  valor: number;
  valor_pago: number | null;
  status: string | null;
  data: string;
  data_pagamento: string | null;
  data_vencimento: string | null;
}

export type SituacaoLinhaExtrato = 'nova' | 'ja_importada' | 'repetida_no_arquivo';
const JANELA_DIAS = 3;
const dias = (a: string, b: string) => Math.abs(Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / 86_400_000;

/**
 * Classifica cada linha do extrato e sugere lançamentos existentes com o
 * mesmo valor, o mesmo sentido (crédito = receita) e data a até 3 dias.
 * Somente leitura: nenhuma linha vira lançamento automaticamente.
 */
export function previaImportacaoExtrato(
  transacoes: ReadonlyArray<TransacaoExtrato>,
  jaImportados: ReadonlySet<string>,
  lancamentos: ReadonlyArray<LancamentoConferencia>,
) {
  const vistos = new Set<string>();
  return transacoes.map((t) => {
    const situacao: SituacaoLinhaExtrato = vistos.has(t.fitid) ? 'repetida_no_arquivo' : jaImportados.has(t.fitid) ? 'ja_importada' : 'nova';
    vistos.add(t.fitid);
    const tipo = t.valor >= 0 ? 'receita' : 'despesa';
    const centavos = Math.abs(emCentavos(t.valor));
    const correspondencias = lancamentos.filter((l) => {
      if (l.tipo !== tipo || l.status === 'cancelado') return false;
      const quitado = l.status === 'pago' || l.status === 'parcial';
      if (emCentavos(quitado ? valorRealizado(l) : l.valor) !== centavos) return false;
      const referencia = (quitado && l.data_pagamento) || l.data_vencimento || l.data;
      return dias(referencia, t.data) <= JANELA_DIAS;
    });
    return { ...t, situacao, correspondencias };
  });
}
