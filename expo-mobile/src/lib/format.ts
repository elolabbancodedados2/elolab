const CLINIC_TZ = 'America/Sao_Paulo';

/** YYYY-MM-DD in the clinic's timezone, offset by `days`. */
export function clinicDate(days = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(Date.now() + days * 86400000));
  const part = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function timeLabel(value: string | null | undefined) {
  if (!value) return '—';
  if (value.includes('T')) return new Intl.DateTimeFormat('pt-BR', { timeZone: CLINIC_TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  return value.slice(0, 5);
}

/** DD/MM/AAAA for date-only values, DD/MM/AAAA HH:mm for timestamps. */
export function dateLabel(value: string | null | undefined) {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: CLINIC_TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(n) ? n : 0);
}

/** "em_atendimento" → "Em atendimento". */
export function humanize(value: string | null | undefined) {
  if (!value) return '—';
  const text = value.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Parses "1.234,56" or "1234.56" into a number; NaN when invalid. */
export function parseMoney(value: string) {
  const v = value.trim().replace(/\s|R\$/g, '');
  const normalized = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v;
  return /^-?\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

/** Converts DD/MM/AAAA to YYYY-MM-DD; null when invalid. */
export function parseDateBR(value: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return d.getUTCDate() === Number(m[1]) && d.getUTCMonth() + 1 === Number(m[2]) ? iso : null;
}

/** Maps Supabase/network errors to pt-BR copy; keeps database messages written for users. */
export function friendlyError(error: unknown, fallback = 'Não conseguimos concluir agora. Tente novamente em instantes.') {
  const raw = typeof error === 'string' ? error : (error as { message?: string } | undefined)?.message || '';
  const msg = raw.toLowerCase();
  if (msg.includes('network request failed') || msg.includes('failed to fetch')) return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
  if (msg.includes('jwt') || msg.includes('not authenticated')) return 'Sua sessão expirou. Entre novamente para continuar.';
  if (msg.includes('permission') || msg.includes('row-level security')) return 'Seu perfil não tem permissão para esta ação.';
  if (msg.includes('timeout') || msg.includes('timed out')) return 'A consulta demorou mais que o esperado. Tente novamente.';
  if (msg.includes('duplicate key')) return 'Já existe um registro com esses dados.';
  if (!raw || /violates|syntax|column|relation|function|schema|null value|operator|invalid input/.test(msg)) return fallback;
  return raw;
}
