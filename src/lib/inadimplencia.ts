import { formatCsvCell } from '@/lib/csv';
import { emCentavos } from '@/lib/dinheiro';

export type FaixaAtraso = '1-30' | '31-60' | '61-90' | '90+';

export const FAIXAS_ATRASO: ReadonlyArray<{ id: FaixaAtraso; label: string; max: number }> = [
  { id: '1-30', label: '1 a 30 dias', max: 30 },
  { id: '31-60', label: '31 a 60 dias', max: 60 },
  { id: '61-90', label: '61 a 90 dias', max: 90 },
  { id: '90+', label: 'Mais de 90 dias', max: Infinity },
];

/** Título vencido hoje ou no futuro não tem faixa de atraso. */
export function faixaAtraso(dias: number): FaixaAtraso | null {
  if (!(dias >= 1)) return null;
  return FAIXAS_ATRASO.find((faixa) => dias <= faixa.max)!.id;
}

export function resumoPorFaixa(itens: ReadonlyArray<{ dias: number; saldo: number }>) {
  const centavos = Object.fromEntries(FAIXAS_ATRASO.map((f) => [f.id, { quantidade: 0, total: 0 }])) as Record<FaixaAtraso, { quantidade: number; total: number }>;
  for (const item of itens) {
    const faixa = faixaAtraso(item.dias);
    if (!faixa) continue;
    centavos[faixa].quantidade += 1;
    centavos[faixa].total += emCentavos(item.saldo);
  }
  for (const faixa of FAIXAS_ATRASO) centavos[faixa.id].total /= 100;
  return centavos;
}

export interface TituloCobrancaManual {
  paciente: string | null;
  telefone: string | null;
  email: string | null;
  descricao: string | null;
  saldo: number;
  vencimento: string | null;
  dias: number;
}

const reais = (centavos: number) => (centavos / 100).toFixed(2).replace('.', ',');
const dataBr = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : '');

/**
 * CSV (separador `;`) somente com o necessário para a cobrança manual: sem
 * dados clínicos. A última linha traz a quantidade e o total para conferência.
 */
export function csvCobrancaManual(titulos: ReadonlyArray<TituloCobrancaManual>): string {
  const cabecalho = ['Paciente', 'Telefone', 'E-mail', 'Descrição', 'Saldo em aberto', 'Vencimento', 'Dias de atraso', 'Faixa de atraso'];
  let total = 0;
  const linhas = titulos.map((t) => {
    const centavos = emCentavos(t.saldo);
    total += centavos;
    const faixa = faixaAtraso(t.dias);
    return [t.paciente, t.telefone, t.email, t.descricao, reais(centavos), dataBr(t.vencimento), t.dias,
      FAIXAS_ATRASO.find((f) => f.id === faixa)?.label ?? ''];
  });
  linhas.push(['Total', '', '', `${titulos.length} título(s)`, reais(total), '', '', '']);
  return '\uFEFF' + [cabecalho, ...linhas].map((linha) => linha.map(formatCsvCell).join(';')).join('\r\n');
}
