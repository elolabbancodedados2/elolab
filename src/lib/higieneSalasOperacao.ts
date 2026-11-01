/** Regras da higienização de salas que não dependem do React. */
import { dateOnlyInTimeZone } from '@/lib/dateOnly';
import { formatCsvCell } from '@/lib/csv';

const FUSO = 'America/Sao_Paulo';

const partes = (instante: Date) => {
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instante);
  const get = (tipo: string) => p.find(x => x.type === tipo)?.value ?? '';
  return { dia: get('day'), mes: get('month'), ano: get('year'), hora: get('hour'), minuto: get('minute') };
};

/**
 * "agora", "há 12 min", "hoje às 14:03" para hoje; "01/11 14:03" nos outros
 * dias do ano; "01/11/2025 14:03" em outro ano. Sem segundos.
 */
export function formatarMomento(valor: string | null | undefined, agora: Date = new Date()): string {
  if (!valor) return '—';
  const instante = new Date(valor);
  if (!Number.isFinite(instante.getTime())) return '—';
  const p = partes(instante);
  if (dateOnlyInTimeZone(instante, FUSO) === dateOnlyInTimeZone(agora, FUSO)) {
    const minutos = Math.floor((agora.getTime() - instante.getTime()) / 60_000);
    if (minutos >= 0 && minutos < 1) return 'agora';
    if (minutos >= 1 && minutos < 60) return `há ${minutos} min`;
    return `hoje às ${p.hora}:${p.minuto}`;
  }
  const mesmoAno = p.ano === partes(agora).ano;
  return `${p.dia}/${p.mes}${mesmoAno ? '' : `/${p.ano}`} ${p.hora}:${p.minuto}`;
}

export interface ProblemaChecklist { linha: number | null; mensagem: string }

/** Mesmas regras da função do servidor, explicadas linha a linha. */
export function validarChecklist(titulo: string, texto: string): ProblemaChecklist[] {
  const problemas: ProblemaChecklist[] = [];
  const t = titulo.trim();
  if (t.length < 3) problemas.push({ linha: null, mensagem: 'O nome do checklist precisa de ao menos 3 caracteres.' });
  if (t.length > 120) problemas.push({ linha: null, mensagem: 'O nome do checklist pode ter até 120 caracteres.' });
  const linhas = texto.split('\n').map((label, indice) => ({ label: label.trim(), linha: indice + 1 })).filter(l => l.label);
  if (linhas.length === 0) problemas.push({ linha: null, mensagem: 'Inclua ao menos um item.' });
  if (linhas.length > 40) problemas.push({ linha: null, mensagem: `O checklist aceita até 40 itens (há ${linhas.length}).` });
  for (const { label, linha } of linhas) {
    if (label.length < 3) problemas.push({ linha, mensagem: `Linha ${linha}: "${label}" é curta demais (mínimo 3 caracteres).` });
    if (label.length > 160) problemas.push({ linha, mensagem: `Linha ${linha}: passa de 160 caracteres (${label.length}).` });
  }
  return problemas;
}

export interface ExecucaoRelatorio {
  id: string; room_id: string; started_by: string; started_at: string; submitted_by: string | null; submitted_at: string | null; notes: string | null;
}
export interface RevisaoRelatorio { execution_id: string; reviewer_id: string; decision: 'approved' | 'rejected'; note: string; created_at: string }

const dataHora = (valor: string | null | undefined) => {
  if (!valor) return '';
  const p = partes(new Date(valor));
  return `${p.dia}/${p.mes}/${p.ano} ${p.hora}:${p.minuto}`;
};

/** Execuções iniciadas entre `de` e `ate` (datas civis, inclusive), da mais recente para a mais antiga. */
export function linhasRelatorioHigiene(params: {
  execucoes: ExecucaoRelatorio[];
  revisoes: RevisaoRelatorio[];
  salas: Map<string, string>;
  pessoas: Map<string, string>;
  de: string;
  ate: string;
}): Array<Record<string, string>> {
  const revisaoPor = new Map(params.revisoes.map(r => [r.execution_id, r]));
  const nome = (id: string | null | undefined) => (id ? params.pessoas.get(id) || 'Equipe' : '');
  return params.execucoes
    .filter(e => {
      const dia = dateOnlyInTimeZone(new Date(e.started_at), FUSO);
      return dia >= params.de && dia <= params.ate;
    })
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .map(e => {
      const r = revisaoPor.get(e.id);
      return {
        Sala: params.salas.get(e.room_id) ?? 'Sala',
        Início: dataHora(e.started_at),
        'Executado por': nome(e.submitted_by ?? e.started_by),
        'Enviado para inspeção': dataHora(e.submitted_at),
        Observação: e.notes ?? '',
        Inspeção: dataHora(r?.created_at),
        Inspetor: nome(r?.reviewer_id),
        Resultado: r ? (r.decision === 'approved' ? 'Aprovada' : 'Reprovada') : e.submitted_at ? 'Aguardando inspeção' : 'Em execução',
        'Nota da inspeção': r?.note ?? '',
      };
    });
}

export function csvRelatorioHigiene(linhas: Array<Record<string, string>>): string {
  const cabecalho = ['Sala', 'Início', 'Executado por', 'Enviado para inspeção', 'Observação', 'Inspeção', 'Inspetor', 'Resultado', 'Nota da inspeção'];
  return `\uFEFF${[cabecalho, ...linhas.map(l => cabecalho.map(c => l[c] ?? ''))].map(l => l.map(formatCsvCell).join(';')).join('\r\n')}`;
}
