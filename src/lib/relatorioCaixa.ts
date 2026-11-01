/**
 * Relatório de fechamento do caixa, comum à tela de hoje, ao histórico e ao
 * fechamento. Antes cada tela montava o seu, com totais e colunas diferentes.
 */
import { calcularSaldoGaveta, calcularTotaisCaixa } from '@/lib/caixaDiario';
import { dataHoraSP, horaSP, rotuloForma } from '@/lib/caixaFormatacao';
import { diferencaEmReais } from '@/lib/dinheiro';

export interface CaixaRelatorio {
  data: string;
  aberto: boolean;
  valor_abertura: number;
  valor_fechamento: number | null;
  operador_abertura: string | null;
  operador_fechamento: string | null;
  observacoes?: string | null;
}

export interface MovimentoRelatorio {
  tipo: 'receita' | 'despesa' | 'sangria' | 'suprimento';
  valor: number;
  forma_pagamento?: string | null;
  descricao?: string | null;
  created_at?: string | null;
  paciente_nome?: string | null;
  pacientes?: { nome: string } | null;
}

const ROTULO_TIPO: Record<MovimentoRelatorio['tipo'], string> = {
  receita: 'Receita', despesa: 'Despesa', sangria: 'Sangria', suprimento: 'Suprimento',
};

export const escapeHtml = (valor: unknown) => String(valor ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const moeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

export function nomePacienteDoMovimento(movimento: Pick<MovimentoRelatorio, 'paciente_nome' | 'pacientes'>): string {
  return movimento.paciente_nome || movimento.pacientes?.nome || '';
}

/** Texto curto da diferença da gaveta: "Bateu", "Falta R$ 10,00" ou "Sobra R$ 5,00". */
export function textoDiferenca(diferenca: number | null): string {
  if (diferenca === null) return '—';
  if (diferenca === 0) return 'Bateu';
  return `${diferenca < 0 ? 'Falta' : 'Sobra'} ${moeda(Math.abs(diferenca))}`;
}

export function montarRelatorioCaixaHtml({
  caixa, movimentos, emitidoPor, emitidoEm = new Date(),
}: {
  caixa: CaixaRelatorio;
  movimentos: MovimentoRelatorio[];
  emitidoPor?: string | null;
  emitidoEm?: Date;
}): string {
  const abertura = Number(caixa.valor_abertura) || 0;
  const totais = calcularTotaisCaixa(abertura, movimentos);
  const esperado = calcularSaldoGaveta(abertura, movimentos);
  const porForma: Record<string, number> = {};
  movimentos.filter(m => m.tipo === 'receita').forEach(m => {
    const chave = rotuloForma(m.forma_pagamento) || 'Outros';
    porForma[chave] = (porForma[chave] || 0) + (Number(m.valor) || 0);
  });
  const contado = caixa.valor_fechamento === null ? null : Number(caixa.valor_fechamento);
  const diferenca = contado === null ? null : diferencaEmReais(contado, esperado);
  const dataLonga = new Date(`${caixa.data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const linhas = movimentos.map(m => {
    const positivo = m.tipo === 'receita' || m.tipo === 'suprimento';
    return `<tr><td>${escapeHtml(horaSP(m.created_at))}</td><td>${escapeHtml(ROTULO_TIPO[m.tipo])}</td><td>${escapeHtml(m.descricao)}</td><td>${escapeHtml(nomePacienteDoMovimento(m) || '—')}</td><td>${escapeHtml(rotuloForma(m.forma_pagamento))}</td><td class="num ${positivo ? 'pos' : 'neg'}">${positivo ? '+' : '−'}${escapeHtml(moeda(Math.abs(Number(m.valor) || 0)))}</td></tr>`;
  }).join('');
  return `
      <h1>Relatório de fechamento de caixa</h1>
      <div class="muted">${escapeHtml(dataLonga)} · ${caixa.aberto ? 'Caixa ainda aberto (parcial)' : 'Caixa fechado'}${emitidoPor ? ` · emitido por ${escapeHtml(emitidoPor)}` : ''} · ${escapeHtml(dataHoraSP(emitidoEm))}</div>
      <div class="grid">
        <div class="box">Abertura<b>${escapeHtml(moeda(abertura))}</b><span class="muted">${escapeHtml(caixa.operador_abertura || '—')}</span></div>
        <div class="box">Receitas<b class="pos">${escapeHtml(moeda(totais.receita))}</b></div>
        <div class="box">Despesas<b class="neg">${escapeHtml(moeda(totais.despesa))}</b></div>
        <div class="box">Sangrias<b class="neg">${escapeHtml(moeda(totais.sangria))}</b></div>
        <div class="box">Suprimentos<b class="pos">${escapeHtml(moeda(totais.suprimento))}</b></div>
        <div class="box">Resultado do dia<b>${escapeHtml(moeda(totais.final))}</b></div>
      </div>
      <h2>Conferência da gaveta</h2>
      <div class="grid">
        <div class="box">Dinheiro esperado<b>${escapeHtml(moeda(esperado))}</b></div>
        <div class="box">Dinheiro contado<b>${contado === null ? '—' : escapeHtml(moeda(contado))}</b><span class="muted">${escapeHtml(caixa.operador_fechamento || '')}</span></div>
        <div class="box">Diferença<b class="dif ${diferenca === null ? '' : diferenca < 0 ? 'neg' : diferenca > 0 ? 'pos' : ''}">${escapeHtml(textoDiferenca(diferenca))}</b></div>
      </div>
      ${caixa.observacoes ? `<p><strong>Observações:</strong> ${escapeHtml(caixa.observacoes)}</p>` : ''}
      <h2>Receitas por forma de pagamento</h2>
      <table><thead><tr><th>Forma</th><th class="num">Valor</th></tr></thead><tbody>
        ${Object.entries(porForma).sort((a, b) => b[1] - a[1]).map(([forma, valor]) => `<tr><td>${escapeHtml(forma)}</td><td class="num">${escapeHtml(moeda(valor))}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">Sem receitas</td></tr>'}
      </tbody></table>
      <h2>Movimentações (${movimentos.length})</h2>
      <table><thead><tr><th>Hora</th><th>Tipo</th><th>Descrição</th><th>Paciente</th><th>Forma</th><th class="num">Valor</th></tr></thead><tbody>${linhas || '<tr><td colspan="6" class="muted">Nenhuma movimentação</td></tr>'}</tbody></table>
      <div class="assin"><div>Operador do caixa</div><div>Responsável / conferência</div></div>
    `;
}

const ESTILO = `
  body{font-family:Inter,Arial,sans-serif;color:#111;margin:32px;font-size:13px}
  h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:24px 0 8px;border-bottom:2px solid #111;padding-bottom:4px}
  .muted{color:#666}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
  .box{border:1px solid #ddd;border-radius:8px;padding:8px 10px}.box b{display:block;font-size:16px;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee}
  th{font-size:11px;text-transform:uppercase;color:#666}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .neg{color:#b91c1c}.pos{color:#047857}.dif{font-size:18px;font-weight:700}
  .assin{margin-top:48px;display:flex;gap:48px}.assin div{flex:1;border-top:1px solid #111;padding-top:6px;text-align:center;font-size:12px}
  @media print{body{margin:16px}}`;

/**
 * Escreve o relatório numa janela e chama a impressão. Aceita uma janela já
 * aberta no clique (quando o conteúdo só fica pronto depois de uma chamada ao
 * servidor, abrir depois perderia o gesto e o navegador bloquearia).
 * Devolve false quando não há janela.
 */
export function abrirJanelaDeImpressao(titulo: string, corpoHtml: string, janelaPreAberta?: Window | null): boolean {
  // Com "noopener" o navegador devolve null e não dá para escrever o relatório.
  const janela = janelaPreAberta ?? window.open('', '_blank', 'width=900,height=1000');
  if (!janela) return false;
  janela.opener = null;
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title><style>${ESTILO}</style></head><body>${corpoHtml}<script>window.onload=function(){window.print();}</script></body></html>`);
  janela.document.close();
  return true;
}
