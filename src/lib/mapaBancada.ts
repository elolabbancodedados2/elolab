import { escapeHtml } from '@/lib/html';

export type AmostraBancada = {
  codigo_amostra?: string | null;
  status?: string | null;
  urgente?: boolean | null;
  tubo?: string | null;
  tipo_amostra?: string | null;
  setor_id?: string | null;
  laboratorio_setores?: { nome?: string | null } | null;
  pacientes?: { nome?: string | null } | null;
  exames?: { tipo_exame?: string | null } | null;
};

/** Amostras que estão na bancada: coletadas aguardando ou em análise. */
export const STATUS_NA_BANCADA = new Set(['coletado', 'em_analise']);

export function agruparBancadaPorSetor<T extends AmostraBancada>(amostras: T[]): Array<{ setor: string; itens: T[] }> {
  const grupos = new Map<string, { setor: string; itens: T[] }>();
  for (const amostra of amostras) {
    if (!amostra.status || !STATUS_NA_BANCADA.has(amostra.status)) continue;
    const setor = amostra.laboratorio_setores?.nome?.trim() || 'Sem setor';
    const grupo = grupos.get(setor) ?? { setor, itens: [] };
    grupo.itens.push(amostra);
    grupos.set(setor, grupo);
  }
  return [...grupos.values()]
    .map(grupo => ({ ...grupo, itens: [...grupo.itens].sort((a, b) => Number(!!b.urgente) - Number(!!a.urgente)) }))
    .sort((a, b) => (a.setor === 'Sem setor' ? 1 : b.setor === 'Sem setor' ? -1 : a.setor.localeCompare(b.setor, 'pt-BR')));
}

/** Folha A4 por setor para a bancada conferir e anotar resultados. */
export function htmlMapaBancada(amostras: AmostraBancada[], geradoEm: string): string {
  const grupos = agruparBancadaPorSetor(amostras);
  const secoes = grupos.map(grupo => {
    const linhas = grupo.itens.map(item => `<tr><td class="mono">${escapeHtml(item.codigo_amostra ?? '')}</td><td>${escapeHtml(item.pacientes?.nome ?? '')}</td><td>${escapeHtml(item.exames?.tipo_exame ?? item.tipo_amostra ?? '')}</td><td>${escapeHtml(item.tubo ?? '')}</td><td>${item.urgente ? '<strong>Urgente</strong>' : ''}</td><td class="anot"></td></tr>`).join('');
    return `<section><h2>${escapeHtml(grupo.setor)} · ${grupo.itens.length} ${grupo.itens.length === 1 ? 'amostra' : 'amostras'}</h2><table><thead><tr><th>Código</th><th>Paciente</th><th>Exame</th><th>Tubo</th><th>Prioridade</th><th>Anotações</th></tr></thead><tbody>${linhas}</tbody></table></section>`;
  }).join('');
  const corpo = secoes || '<p>Nenhuma amostra coletada ou em análise no momento.</p>';
  return `<html><head><meta charset="utf-8"><title>Mapa de bancada</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;font-size:11px;color:#111}h1{font-size:16px;margin:0 0 4px}h2{font-size:13px;margin:16px 0 6px}section{page-break-after:always}section:last-of-type{page-break-after:auto}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px;text-align:left;vertical-align:top}th{background:#f2f2f2}.mono{font-family:monospace}.anot{width:30%}@media print{.no-print{display:none}}</style></head><body><button class="no-print" id="imprimir-bancada">Imprimir</button><h1>Mapa de bancada</h1><p>Gerado em ${escapeHtml(geradoEm)}</p>${corpo}</body></html>`;
}
