/**
 * Regras puras da tela de Relacionamento (campanhas e NPS).
 *
 * A avaliação pós-consulta usa notas de 1 a 5 (migration
 * 20260817290000). O mesmo corte da view nps_resumo_mensal vale aqui:
 * 5 é promotor, 3 e 4 são neutros, 1 e 2 são detratores.
 */

export type CategoriaNps = 'promotor' | 'neutro' | 'detrator';

export type ResumoNps = {
  total: number;
  promotores: number;
  neutros: number;
  detratores: number;
  pctPromotores: number;
  pctNeutros: number;
  pctDetratores: number;
  /** De -100 a 100; null quando não há avaliações. */
  nps: number | null;
};

export type FeedbackNps = {
  nota: number;
  created_at: string | null;
  medico_id?: string | null;
  medico_nome?: string | null;
};

export const PERIODOS_NPS = [30, 90, 365] as const;
export type PeriodoNps = (typeof PERIODOS_NPS)[number];

export function classificarNota(nota: number): CategoriaNps | null {
  if (!Number.isFinite(nota) || nota < 1 || nota > 5) return null;
  if (nota === 5) return 'promotor';
  if (nota >= 3) return 'neutro';
  return 'detrator';
}

/**
 * Percentuais por maior resto, para que a barra empilhada some exatamente 100.
 */
function percentuais(valores: number[], total: number): number[] {
  if (total <= 0) return valores.map(() => 0);
  const brutos = valores.map((v) => (v / total) * 100);
  const base = brutos.map(Math.floor);
  let sobra = 100 - base.reduce((a, b) => a + b, 0);
  const ordem = brutos
    .map((v, i) => ({ i, resto: v - Math.floor(v) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of ordem) {
    if (sobra <= 0) break;
    base[i] += 1;
    sobra -= 1;
  }
  return base;
}

export function calcularNps(notas: number[]): ResumoNps {
  let promotores = 0;
  let neutros = 0;
  let detratores = 0;
  for (const nota of notas) {
    const categoria = classificarNota(nota);
    if (categoria === 'promotor') promotores++;
    else if (categoria === 'neutro') neutros++;
    else if (categoria === 'detrator') detratores++;
  }
  const total = promotores + neutros + detratores;
  const [pctPromotores, pctNeutros, pctDetratores] = percentuais([promotores, neutros, detratores], total);
  return {
    total,
    promotores,
    neutros,
    detratores,
    pctPromotores,
    pctNeutros,
    pctDetratores,
    nps: total ? Math.round((100 * (promotores - detratores)) / total) : null,
  };
}

/** Faixa de leitura do NPS, para o texto ao lado do número. */
export function leituraNps(nps: number | null): string {
  if (nps === null) return 'Sem avaliações no período';
  if (nps >= 75) return 'Excelente';
  if (nps >= 50) return 'Muito bom';
  if (nps >= 0) return 'Razoável';
  return 'Precisa de atenção';
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split('-').map(Number);
  if (!ano || !mes) return chave;
  return `${MESES[mes - 1]}/${String(ano).slice(2)}`;
}

/** Linha mensal no formato da view nps_resumo_mensal. */
export type LinhaNpsMensal = {
  mes: string;
  total: number | null;
  promotores: number | null;
  neutros: number | null;
  detratores: number | null;
};

export function evolucaoMensal(linhas: LinhaNpsMensal[]) {
  const porMes = new Map<string, { total: number; promotores: number; detratores: number }>();
  for (const linha of linhas) {
    const chave = String(linha.mes).slice(0, 7);
    const atual = porMes.get(chave) ?? { total: 0, promotores: 0, detratores: 0 };
    atual.total += Number(linha.total ?? 0);
    atual.promotores += Number(linha.promotores ?? 0);
    atual.detratores += Number(linha.detratores ?? 0);
    porMes.set(chave, atual);
  }
  return [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({
      mes,
      rotulo: rotuloMes(mes),
      total: v.total,
      nps: v.total ? Math.round((100 * (v.promotores - v.detratores)) / v.total) : null,
    }));
}

export function npsPorMedico(feedbacks: FeedbackNps[]) {
  const grupos = new Map<string, { nome: string; notas: number[] }>();
  for (const f of feedbacks) {
    const chave = f.medico_id ?? 'sem-medico';
    const grupo = grupos.get(chave) ?? { nome: f.medico_nome || (f.medico_id ? 'Profissional' : 'Sem profissional'), notas: [] };
    grupo.notas.push(f.nota);
    grupos.set(chave, grupo);
  }
  return [...grupos.entries()]
    .map(([id, g]) => ({ id, nome: g.nome, ...calcularNps(g.notas) }))
    .sort((a, b) => b.total - a.total || (b.nps ?? -101) - (a.nps ?? -101) || a.nome.localeCompare(b.nome));
}

// ─── Campanhas ─────────────────────────────────────────────

export const CANAIS_CAMPANHA = ['whatsapp', 'email'] as const;
export type CanalCampanha = (typeof CANAIS_CAMPANHA)[number];

export const PUBLICOS_CAMPANHA = ['ativos', 'sem_retorno', 'aniversariantes_mes', 'detratores_nps'] as const;
export type PublicoCampanha = (typeof PUBLICOS_CAMPANHA)[number];

export type StatusCampanha = 'rascunho' | 'agendada' | 'enviada' | 'cancelada';

export const ROTULO_CANAL: Record<CanalCampanha, string> = { whatsapp: 'WhatsApp', email: 'E-mail' };

export const ROTULO_PUBLICO: Record<PublicoCampanha, string> = {
  ativos: 'Pacientes ativos',
  sem_retorno: 'Sem retorno',
  aniversariantes_mes: 'Aniversariantes do mês',
  detratores_nps: 'Avaliaram mal (detratores)',
};

export const ROTULO_STATUS: Record<StatusCampanha, string> = {
  rascunho: 'Rascunho',
  agendada: 'Agendada',
  enviada: 'Na fila de envio',
  cancelada: 'Cancelada',
};

export function descricaoPublico(publico: PublicoCampanha, dias: number): string {
  if (publico === 'sem_retorno') return `Sem consulta há mais de ${dias} dias e sem horário marcado`;
  if (publico === 'detratores_nps') return `Deram nota 1 ou 2 nos últimos ${dias} dias`;
  if (publico === 'aniversariantes_mes') return 'Fazem aniversário no mês do envio';
  return 'Todos os pacientes ativos com contato no canal';
}

export const VARIAVEIS_CAMPANHA = [
  { token: '{{primeiro_nome}}', rotulo: 'Primeiro nome' },
  { token: '{{nome}}', rotulo: 'Nome completo' },
  { token: '{{clinica}}', rotulo: 'Nome da clínica' },
] as const;

/**
 * Mesma regra de public.aplicar_variaveis_campanha no banco: nome vazio vira
 * "paciente" e clínica vazia vira "a clínica".
 */
export function aplicarVariaveis(mensagem: string, dados: { nome?: string | null; clinica?: string | null }): string {
  const nome = (dados.nome ?? '').trim() || 'paciente';
  const primeiro = (dados.nome ?? '').trim().split(' ')[0] || 'paciente';
  const clinica = (dados.clinica ?? '').trim() || 'a clínica';
  return mensagem
    .split('{{primeiro_nome}}').join(primeiro)
    .split('{{nome}}').join(nome)
    .split('{{clinica}}').join(clinica);
}

export type PreviaPublico = {
  total: number;
  amostra: Array<{ id: string; nome: string }>;
  clinica?: string | null;
};

export function normalizarPrevia(dados: unknown): PreviaPublico {
  const bruto = (dados && typeof dados === 'object' ? dados : {}) as Record<string, unknown>;
  const amostra = Array.isArray(bruto.amostra) ? bruto.amostra : [];
  return {
    total: Number.isFinite(Number(bruto.total)) ? Number(bruto.total) : 0,
    amostra: amostra
      .filter((p): p is { id: string; nome: string } => !!p && typeof (p as Record<string, unknown>).id === 'string')
      .slice(0, 20)
      .map((p) => ({ id: p.id, nome: String(p.nome ?? '') })),
    clinica: typeof bruto.clinica === 'string' ? bruto.clinica : null,
  };
}

/** Prévia da mensagem com o primeiro paciente do público, ou um exemplo. */
export function previaMensagem(mensagem: string, previa: PreviaPublico | null | undefined, clinicaFallback?: string | null) {
  const primeiro = previa?.amostra[0];
  return {
    exemplo: !primeiro,
    destinatario: primeiro?.nome ?? 'Maria Exemplo',
    texto: aplicarVariaveis(mensagem, {
      nome: primeiro?.nome ?? 'Maria Exemplo',
      clinica: previa?.clinica ?? clinicaFallback ?? null,
    }),
  };
}

/** Insere a variável na posição do cursor e devolve o texto e o novo cursor. */
export function inserirVariavel(texto: string, token: string, inicio = texto.length, fim = inicio) {
  const a = Math.max(0, Math.min(inicio, texto.length));
  const b = Math.max(a, Math.min(fim, texto.length));
  return { texto: texto.slice(0, a) + token + texto.slice(b), cursor: a + token.length };
}

export const LIMITE_DESTINATARIOS = 2000;

export type ResultadoFila = {
  campanha_id: string;
  pendente: number;
  enviando: number;
  enviado: number;
  erro: number;
  cancelado: number;
  incerto: number;
};

export function resumoResultado(r: Partial<ResultadoFila> | null | undefined) {
  const n = (v: unknown) => Number(v ?? 0) || 0;
  return {
    enviados: n(r?.enviado),
    erros: n(r?.erro) + n(r?.incerto),
    pendentes: n(r?.pendente) + n(r?.enviando),
    cancelados: n(r?.cancelado),
  };
}

export type RascunhoCampanha = {
  id?: string;
  nome: string;
  canal: CanalCampanha;
  publico: PublicoCampanha;
  publico_dias: number;
  mensagem: string;
  agendada_para: string | null;
};

export function validarRascunho(r: RascunhoCampanha): string | null {
  if (r.nome.trim().length < 3) return 'Dê um nome com pelo menos 3 letras.';
  if (r.mensagem.trim().length < 5) return 'Escreva a mensagem.';
  if (r.mensagem.length > 2000) return 'A mensagem pode ter até 2.000 caracteres.';
  if (!Number.isInteger(r.publico_dias) || r.publico_dias < 1 || r.publico_dias > 3650) return 'Informe entre 1 e 3.650 dias.';
  if (r.agendada_para && Number.isNaN(Date.parse(r.agendada_para))) return 'Data de envio inválida.';
  return null;
}

export const MENSAGEM_PADRAO: Record<PublicoCampanha, string> = {
  ativos: 'Olá, {{primeiro_nome}}! A equipe da {{clinica}} tem novidades para você. Responda esta mensagem se quiser saber mais.',
  sem_retorno: 'Olá, {{primeiro_nome}}! Faz tempo que você não vem à {{clinica}}. Que tal marcar seu retorno? Responda esta mensagem e encontramos um horário.',
  aniversariantes_mes: 'Feliz aniversário, {{primeiro_nome}}! A equipe da {{clinica}} deseja um ótimo novo ciclo.',
  detratores_nps: 'Olá, {{primeiro_nome}}. Vimos que sua última visita à {{clinica}} não foi como esperava. Podemos conversar para entender o que aconteceu?',
};
