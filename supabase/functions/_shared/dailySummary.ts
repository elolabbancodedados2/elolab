/**
 * Resumo diário por e-mail (opt-in em Minhas preferências).
 *
 * Só contagens: nenhum nome de paciente, valor ou dado clínico sai no e-mail.
 * Cada seção segue o mesmo limite de perfil das telas correspondentes.
 */
const TZ = 'America/Sao_Paulo';
export const DAILY_SUMMARY_HOUR = 7;

export type DailySummarySections = {
  agenda: boolean; exames: boolean; contas: boolean; tarefas: boolean;
  /** Médico sem papel administrativo/enfermagem vê só a própria agenda e os próprios pedidos. */
  proprioMedico: boolean;
};

export function dailySummarySections(roles: Set<string>): DailySummarySections {
  const admin = roles.has('admin');
  return {
    agenda: ['admin', 'medico', 'recepcao', 'enfermagem'].some((r) => roles.has(r)),
    exames: ['admin', 'medico', 'enfermagem'].some((r) => roles.has(r)),
    contas: admin || roles.has('financeiro'),
    tarefas: roles.size > 0,
    proprioMedico: !admin && roles.has('medico') && !roles.has('enfermagem') && !roles.has('recepcao'),
  };
}

type Pref = { user_id: string; clinica_id: string; email_daily_summary: boolean };
type Perfil = { id: string; clinica_id: string | null; ativo: boolean | null; email: string | null };

/** O resumo vai somente para o e-mail da própria conta, ativa na mesma clínica. */
export function dailySummaryRecipient(pref: Pref, perfil: Perfil | null | undefined): string | null {
  if (!pref.email_daily_summary || !perfil || perfil.id !== pref.user_id) return null;
  if (perfil.clinica_id !== pref.clinica_id || perfil.ativo !== true) return null;
  const email = (perfil.email ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function dailySummaryDue(now = new Date()): { due: boolean; today: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return { due: Number(part('hour')) >= DAILY_SUMMARY_HOUR, today: `${part('year')}-${part('month')}-${part('day')}` };
}

export type DailySummaryCounts = { agenda: number | null; exames: number | null; contas: number | null; tarefas: number | null };

function esc(value: unknown): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (char) => entities[char]);
}

export function buildDailySummaryEmail(input: { nome: string; clinica: string; data: string; appUrl: string; counts: DailySummaryCounts }) {
  const [y, m, d] = input.data.split('-');
  const dataBr = `${d}/${m}/${y}`;
  const linhas: Array<[string, number | null, string]> = [
    ['Consultas de hoje', input.counts.agenda, '/agenda'],
    ['Tarefas abertas atribuídas a você', input.counts.tarefas, '/tarefas'],
    ['Exames aguardando resultado', input.counts.exames, '/exames'],
    ['Contas a receber vencidas', input.counts.contas, '/contas?tab=receber'],
  ];
  const visiveis = linhas.filter(([, valor]) => valor !== null) as Array<[string, number, string]>;
  const base = input.appUrl.replace(/\/$/, '');
  const html = `<h2>Bom dia, ${esc(input.nome)}</h2><p>Resumo de ${dataBr} em ${esc(input.clinica)}.</p>`
    + `<ul>${visiveis.map(([rotulo, valor, href]) => `<li><a href="${esc(base + href)}">${esc(rotulo)}</a>: <b>${valor}</b></li>`).join('')}</ul>`
    + `<p style="font-size:12px;color:#5b6b7f">Você recebe este e-mail porque ativou o resumo diário em Minhas preferências. Desative lá quando quiser.</p>`;
  const text = [`Resumo de ${dataBr} em ${input.clinica}.`, ...visiveis.map(([rotulo, valor]) => `${rotulo}: ${valor}`),
    'Desative em Minhas preferências quando quiser.'].join('\n');
  return { subject: `Resumo do dia ${dataBr} · EloLab`, html, text };
}
