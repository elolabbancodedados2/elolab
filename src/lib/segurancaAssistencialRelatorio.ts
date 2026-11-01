import { CATEGORIES, SEVERITIES, STATUSES, type Report } from '@/lib/seguranca-assistencial';

/**
 * Painel mensal e planilha de apoio à notificação no NOTIVISA (Anvisa).
 *
 * O NOTIVISA não aceita importação de arquivo: a notificação é feita no
 * formulário do portal. A planilha reúne, por relato, os campos que o
 * formulário pede (data, tipo de incidente, grau do dano, local, descrição e
 * ação imediata) para o núcleo de segurança do paciente transcrever. Não leva
 * identificação do relator nem do paciente.
 */

const FUSO = 'America/Sao_Paulo';

/** "2026-10" no fuso da clínica. */
export function chaveMes(valor: string): string | null {
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) return null;
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit' }).formatToParts(data);
  const ano = partes.find(p => p.type === 'year')?.value;
  const mes = partes.find(p => p.type === 'month')?.value;
  return ano && mes ? `${ano}-${mes}` : null;
}

export function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, 15));
  const texto = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(data).replace('.', '');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Últimos N meses (incluindo o atual), do mais antigo para o mais recente. */
export function ultimosMeses(quantidade: number, agora = new Date()): string[] {
  const atual = chaveMes(agora.toISOString())!;
  const [ano, mes] = atual.split('-').map(Number);
  return Array.from({ length: quantidade }, (_, indice) => {
    const deslocamento = quantidade - 1 - indice;
    const data = new Date(Date.UTC(ano, mes - 1 - deslocamento, 1));
    return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export interface ResumoMes {
  mes: string;
  total: number;
  porGravidade: Record<string, number>;
  eventosAdversos: number;
  encerrados: number;
}

/** Contagem por mês de ocorrência, gravidade, eventos adversos e encerrados. */
export function resumoMensal(relatos: Report[], meses: string[]): ResumoMes[] {
  const base = new Map(meses.map(mes => [mes, { mes, total: 0, porGravidade: {} as Record<string, number>, eventosAdversos: 0, encerrados: 0 }]));
  for (const relato of relatos) {
    const mes = chaveMes(relato.occurred_at);
    const item = mes ? base.get(mes) : undefined;
    if (!item) continue;
    item.total += 1;
    item.porGravidade[relato.severity] = (item.porGravidade[relato.severity] ?? 0) + 1;
    if (relato.category === 'adverse_event') item.eventosAdversos += 1;
    if (relato.status === 'closed') item.encerrados += 1;
  }
  return meses.map(mes => base.get(mes)!);
}

/**
 * Tipo de incidente no vocabulário do NOTIVISA (Assistência à saúde):
 * evento adverso, incidente sem dano ou circunstância notificável.
 */
const TIPO_INCIDENTE: Record<string, string> = {
  adverse_event: 'Evento adverso',
  near_miss: 'Near miss (incidente que não atingiu o paciente)',
  unsafe_condition: 'Circunstância notificável',
  medication: 'Incidente envolvendo medicamento',
  fall: 'Queda do paciente',
  infection: 'Infecção relacionada à assistência à saúde',
  equipment: 'Incidente envolvendo equipamento ou dispositivo',
  other: 'Outro',
};

/**
 * Gravidade interna → grau do dano a confirmar. A escala do sistema
 * (baixa a crítica) é de risco, não de dano; a coluna sai como sugestão.
 */
const GRAU_DANO_SUGERIDO: Record<string, string> = {
  low: 'Nenhum ou leve (confirmar)',
  moderate: 'Moderado (confirmar)',
  high: 'Grave (confirmar)',
  critical: 'Grave ou óbito (confirmar)',
};

const dataHoraBr = (valor: string) => {
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(data).replace(',', '');
};

const celula = (valor: string) => `"${valor.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

export function gerarCsvNotivisa(relatos: Report[]): string {
  const cabecalho = [
    'Protocolo interno', 'Data e hora da ocorrência', 'Tipo de incidente (NOTIVISA)', 'Categoria interna',
    'Gravidade interna', 'Grau do dano (sugestão)', 'Local ou setor', 'Descrição do incidente',
    'Ação imediata', 'Situação da análise', 'Registrado em',
  ];
  const linhas = relatos.map(relato => [
    relato.id.slice(0, 8).toUpperCase(),
    dataHoraBr(relato.occurred_at),
    TIPO_INCIDENTE[relato.category] ?? 'Outro',
    CATEGORIES[relato.category] ?? relato.category,
    SEVERITIES[relato.severity] ?? relato.severity,
    GRAU_DANO_SUGERIDO[relato.severity] ?? 'A confirmar',
    relato.location_label || '',
    relato.summary || '',
    relato.immediate_action || '',
    STATUSES[relato.status] ?? relato.status,
    dataHoraBr(relato.created_at),
  ]);
  return [cabecalho, ...linhas].map(linha => linha.map(celula).join(';')).join('\r\n');
}
