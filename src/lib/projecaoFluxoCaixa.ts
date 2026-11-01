import { emCentavos } from '@/lib/dinheiro';

export type CenarioFluxo = 'otimista' | 'realista' | 'conservador';

export const CENARIOS_FLUXO: Record<CenarioFluxo, { label: string; regra: string }> = {
  otimista: { label: 'Otimista', regra: 'Todas as receitas em aberto entram, inclusive as vencidas (no mês atual).' },
  realista: { label: 'Realista', regra: 'Receitas vencidas há até 30 dias entram no mês atual; as mais antigas ficam fora.' },
  conservador: { label: 'Conservador', regra: 'Receitas vencidas ficam fora da projeção.' },
};

export interface LancamentoProjecao {
  id: string;
  tipo: string;
  status: string | null;
  valor: number;
  valor_pago: number | null;
  desconto?: number | null;
  acrescimo?: number | null;
  data: string;
  data_vencimento: string | null;
  recorrente?: boolean | null;
  frequencia_recorrencia?: string | null;
  recorrencia_origem_id?: string | null;
}

export interface MesProjecao {
  mes: string; // YYYY-MM
  realizadoEntradas: number;
  realizadoSaidas: number;
  previstoEntradas: number;
  previstoSaidas: number;
  recorrenteEntradas: number;
  recorrenteSaidas: number;
  saldoMes: number;
  saldoAcumulado: number;
}

const DIAS: Record<string, number> = { semanal: 7, quinzenal: 14 };
const MESES: Record<string, number> = { mensal: 1, bimestral: 2, trimestral: 3, anual: 12 };
const ABERTO = ['pendente', 'atrasado', 'parcial'];
const isoUtc = (d: Date) => d.toISOString().slice(0, 10);

/** Mesma regra de `gerar_proxima_despesa_recorrente`: mantém o dia, limitado ao fim do mês. */
export function proximaOcorrencia(vencimento: string, frequencia: string | null | undefined): string | null {
  const [ano, mes, dia] = vencimento.slice(0, 10).split('-').map(Number);
  if (frequencia && DIAS[frequencia]) return isoUtc(new Date(Date.UTC(ano, mes - 1, dia + DIAS[frequencia])));
  if (!frequencia || !MESES[frequencia]) return null;
  const ultimoDia = new Date(Date.UTC(ano, mes - 1 + MESES[frequencia] + 1, 0)).getUTCDate();
  return isoUtc(new Date(Date.UTC(ano, mes - 1 + MESES[frequencia], Math.min(dia, ultimoDia))));
}

const diasEntre = (de: string, ate: string) => (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000;

/**
 * Projeção mensal: o realizado vem dos movimentos já ocorridos; o previsto,
 * dos saldos em aberto pelo vencimento e das próximas ocorrências de contas
 * recorrentes que ainda não foram geradas. Valores em centavos internamente.
 */
export function projetarFluxoCaixa(
  lancamentos: ReadonlyArray<LancamentoProjecao>,
  realizados: ReadonlyArray<{ tipo: string; valor: number; data: string }>,
  opcoes: { hoje: string; meses: number; cenario: CenarioFluxo },
): MesProjecao[] {
  const [ano, mes] = opcoes.hoje.split('-').map(Number);
  const meses = Array.from({ length: opcoes.meses }, (_, i) => isoUtc(new Date(Date.UTC(ano, mes - 1 + i, 1))).slice(0, 7));
  const mesAtual = meses[0];
  const fimHorizonte = isoUtc(new Date(Date.UTC(ano, mes - 1 + opcoes.meses, 0)));
  const acc = new Map(meses.map((m) => [m, { re: 0, rs: 0, pe: 0, ps: 0, ce: 0, cs: 0 }]));
  const somar = (m: string, tipo: string, centavos: number, recorrente = false) => {
    const alvo = acc.get(m);
    if (!alvo || (tipo !== 'receita' && tipo !== 'despesa')) return;
    if (tipo === 'receita') { alvo.pe += centavos; if (recorrente) alvo.ce += centavos; } else { alvo.ps += centavos; if (recorrente) alvo.cs += centavos; }
  };

  for (const r of realizados) {
    const alvo = acc.get(r.data.slice(0, 7));
    if (!alvo || r.data > opcoes.hoje) continue;
    // Sangria e suprimento são transferências internas e não mudam o resultado
    // (mesma regra de totaisMovimentoCaixa, do Financeiro e do DRE).
    if (r.tipo === 'receita') alvo.re += emCentavos(r.valor);
    else if (r.tipo === 'despesa') alvo.rs += emCentavos(r.valor);
  }

  const temContinuacao = new Set(lancamentos.map((l) => l.recorrencia_origem_id).filter(Boolean));
  for (const l of lancamentos) {
    if (l.status === 'cancelado') continue;
    const vencimento = (l.data_vencimento || l.data).slice(0, 10);
    if (ABERTO.includes(l.status ?? '')) {
      const saldo = Math.max(0, emCentavos(l.valor) - emCentavos(l.desconto ?? 0) + emCentavos(l.acrescimo ?? 0) - emCentavos(l.valor_pago ?? 0));
      if (vencimento >= opcoes.hoje) somar(vencimento.slice(0, 7), l.tipo, saldo);
      else if (l.tipo === 'despesa'
        || opcoes.cenario === 'otimista'
        || (opcoes.cenario === 'realista' && diasEntre(vencimento, opcoes.hoje) <= 30)) somar(mesAtual, l.tipo, saldo);
    }
    if (l.recorrente && !temContinuacao.has(l.id)) {
      let data = proximaOcorrencia(vencimento, l.frequencia_recorrencia);
      while (data && data <= fimHorizonte) {
        if (data >= opcoes.hoje) somar(data.slice(0, 7), l.tipo, emCentavos(l.valor), true);
        data = proximaOcorrencia(data, l.frequencia_recorrencia);
      }
    }
  }

  let acumulado = 0;
  return meses.map((m) => {
    const v = acc.get(m)!;
    const saldo = v.re - v.rs + v.pe - v.ps;
    acumulado += saldo;
    return {
      mes: m,
      realizadoEntradas: v.re / 100, realizadoSaidas: v.rs / 100,
      previstoEntradas: v.pe / 100, previstoSaidas: v.ps / 100,
      recorrenteEntradas: v.ce / 100, recorrenteSaidas: v.cs / 100,
      saldoMes: saldo / 100, saldoAcumulado: acumulado / 100,
    };
  });
}

export interface LoteTissProjecao {
  id: string;
  status: string;
  valor_apresentado: number | null;
  valor_pago: number | null;
  enviado_em: string | null;
  competencia?: string | null;
  convenios?: { prazo_retorno?: number | null } | null;
}

const LOTE_A_RECEBER = ['enviado', 'processando', 'pago_parcial'];

/**
 * Lote TISS enviado ainda não vira lançamento: a receita só nasce quando o
 * retorno é conciliado. Para a projeção não esquecer esse dinheiro, o saldo
 * do lote entra como receita prevista na data do envio + prazo de retorno do
 * convênio (30 dias quando não informado).
 */
export function lotesTissComoRecebiveis(lotes: ReadonlyArray<LoteTissProjecao>): LancamentoProjecao[] {
  return lotes.flatMap((lote) => {
    if (!LOTE_A_RECEBER.includes(lote.status)) return [];
    const saldo = Number(lote.valor_apresentado || 0) - Number(lote.valor_pago || 0);
    const base = (lote.enviado_em || lote.competencia || '').slice(0, 10);
    if (saldo <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(base)) return [];
    const prazo = Number(lote.convenios?.prazo_retorno);
    const dias = Number.isFinite(prazo) && prazo >= 0 ? prazo : 30;
    const [ano, mes, dia] = base.split('-').map(Number);
    const vencimento = isoUtc(new Date(Date.UTC(ano, mes - 1, dia + dias)));
    return [{
      id: `lote-tiss-${lote.id}`,
      tipo: 'receita',
      status: 'pendente',
      valor: saldo,
      valor_pago: 0,
      data: base,
      data_vencimento: vencimento,
    }];
  });
}
