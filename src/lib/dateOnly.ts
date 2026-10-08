/**
 * Conversão segura de colunas DATE do Postgres para Date do JavaScript.
 *
 * O PROBLEMA
 * Uma coluna DATE chega do Supabase como "2026-07-27". O construtor do
 * JavaScript trata uma string ISO só-data como UTC:
 *
 *   new Date('2026-07-27')            → 2026-07-27T00:00:00Z
 *   ...exibido em America/Sao_Paulo   → 26/07/2026  ❌ um dia a menos
 *
 * Num sistema de saúde isso significa atestado, receita, vencimento e data de
 * nascimento aparecendo com a data errada — e, em cálculos de atraso, um dia
 * a mais de inadimplência.
 *
 * A SOLUÇÃO
 * Ancorar no meio-dia local. Nenhum fuso do mundo desloca 12h a ponto de
 * cruzar a virada do dia, então a data exibida é sempre a data gravada.
 *
 * QUANDO USAR
 * Só para colunas DATE (`data`, `data_emissao`, `data_vencimento`,
 * `data_nascimento`, `validade`...). Colunas TIMESTAMPTZ (`created_at`,
 * `updated_at`, `timestamp`) já carregam o instante correto — nessas, use
 * `new Date()` normalmente.
 */

/** Converte "YYYY-MM-DD" em Date no fuso local, ancorado ao meio-dia. */
export function parseDateOnly(value: string): Date;
export function parseDateOnly(value: string | null | undefined): Date | null;
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;

  // Já vem com hora (timestamptz ou "YYYY-MM-DDTHH:mm") → respeita o valor
  if (value.includes('T') || value.includes(' ')) return new Date(value);

  return new Date(`${value}T12:00:00`);
}

/** Valida uma data civil no formato YYYY-MM-DD sem normalizar dias inexistentes. */
export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Um `Date` como "YYYY-MM-DD" no fuso local (não em UTC).
 *
 * Use no lugar de `data.toISOString().split('T')[0]`, que devolve o dia em UTC:
 * no Brasil (UTC−3), das 21h à meia-noite esse recorte já é o dia seguinte, e a
 * clínica que atende à noite grava lançamento, agendamento e vencimento com a
 * data errada.
 */
export function toDateOnly(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Data de hoje como "YYYY-MM-DD" no fuso local (não em UTC). */
export function todayDateOnly(): string {
  return toDateOnly(new Date());
}

/** Civil date for a business timezone, independent of the device timezone. */
export function dateOnlyInTimeZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Início do dia civil como instante ISO, respeitando as regras históricas do
 * fuso (inclusive mudanças de horário de verão). Retorna o primeiro instante
 * cujo dia local é igual ou posterior à data solicitada; isso também cobre
 * fusos que avançaram o relógio à meia-noite.
 */
export function inicioDoDiaEmFusoIso(data: string, timeZone: string): string {
  if (!isValidDateOnly(data)) throw new Error('Data civil inválida.');

  const centro = Date.parse(`${data}T00:00:00Z`);
  let inferior = centro - 36 * 60 * 60 * 1000;
  let superior = centro + 36 * 60 * 60 * 1000;

  while (superior - inferior > 1) {
    const meio = Math.floor((inferior + superior) / 2);
    const diaLocal = dateOnlyInTimeZone(new Date(meio), timeZone);
    if (diaLocal >= data) superior = meio;
    else inferior = meio;
  }

  return new Date(superior).toISOString();
}

/** Today at the clinic's fixed business timezone, São Paulo. */
export function todaySaoPauloDateOnly(instant: Date = new Date()): string {
  return dateOnlyInTimeZone(instant, 'America/Sao_Paulo');
}

/** Format a timestamp in the clinic's business timezone, independent of device settings. */
export function formatDateTimeSaoPaulo(value: string | Date | null | undefined, includeSeconds = false): string {
  if (!value) return '—';
  const instant = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(instant.getTime())) return '—';

  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' as const } : {}),
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  const horario = `${get('hour')}:${get('minute')}${includeSeconds ? `:${get('second')}` : ''}`;
  return `${get('day')}/${get('month')}/${get('year')} ${horario}`;
}

/** Próxima execução recorrente no horário civil de São Paulo. */
export function proximaExecucaoSaoPaulo(
  frequencia: 'diaria' | 'semanal' | 'mensal',
  hora: string,
  diaSemana = 1,
  diaMes = 1,
  agora = new Date(),
): string {
  const matchHora = hora.match(/^(\d{2}):(\d{2})$/);
  if (!matchHora) throw new Error('Horário inválido para agendamento.');
  const horaLocal = Number(matchHora[1]);
  const minutoLocal = Number(matchHora[2]);
  if (horaLocal > 23 || minutoLocal > 59) throw new Error('Horário inválido para agendamento.');
  if (frequencia === 'semanal' && (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6)) {
    throw new Error('Selecione um dia da semana válido.');
  }
  if (frequencia === 'mensal' && (!Number.isInteger(diaMes) || diaMes < 1 || diaMes > 28)) {
    throw new Error('Selecione um dia do mês entre 1 e 28.');
  }

  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(agora);
  const obter = (tipo: string) => Number(partes.find(parte => parte.type === tipo)?.value);
  const atual = new Date(Date.UTC(obter('year'), obter('month') - 1, obter('day')));
  if (frequencia === 'diaria') {
    // A data de hoje fica e será avançada abaixo se o horário já passou.
  } else if (frequencia === 'semanal') {
    const diasAteExecucao = (diaSemana - atual.getUTCDay() + 7) % 7;
    atual.setUTCDate(atual.getUTCDate() + diasAteExecucao);
  } else {
    atual.setUTCDate(diaMes);
  }

  const converterParaInstante = (dataLocal: Date) => {
    const ano = dataLocal.getUTCFullYear();
    const mes = dataLocal.getUTCMonth() + 1;
    const dia = dataLocal.getUTCDate();
    const comoUtc = Date.UTC(ano, mes - 1, dia, horaLocal, minutoLocal);
    const representacao = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(comoUtc));
    const parte = (tipo: string) => Number(representacao.find(item => item.type === tipo)?.value);
    const comoHorarioLocalTratadoUtc = Date.UTC(parte('year'), parte('month') - 1, parte('day'), parte('hour'), parte('minute'), parte('second'));
    return new Date(comoUtc - (comoHorarioLocalTratadoUtc - comoUtc));
  };

  let instante = converterParaInstante(atual);
  if (instante <= agora) {
    if (frequencia === 'diaria') atual.setUTCDate(atual.getUTCDate() + 1);
    else if (frequencia === 'semanal') atual.setUTCDate(atual.getUTCDate() + 7);
    else atual.setUTCMonth(atual.getUTCMonth() + 1);
    instante = converterParaInstante(atual);
  }
  return instante.toISOString();
}

/** Whether a clinic appointment start is in the past, using São Paulo time. */
export function appointmentStartHasPassed(date: string, time: string, instant: Date = new Date()): boolean {
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return true;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const today = `${get('year')}-${get('month')}-${get('day')}`;
  const nowMinutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
  if (date < today) return true;
  if (date > today || !time) return false;
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return true;
  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  return startMinutes <= nowMinutes;
}

/** Idade completa, preservando o dia civil de nascimento vindo de uma coluna DATE. */
export function ageFromDateOnly(value: string, referenceDate: Date = new Date()): number {
  const birthDate = parseDateOnly(value);
  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDifference = referenceDate.getMonth() - birthDate.getMonth();
  if (
    monthDifference < 0 ||
    (monthDifference === 0 && referenceDate.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}

/** Dias inteiros entre duas datas-only. Positivo = `fim` no futuro. */
export function daysBetweenDateOnly(inicio: string, fim: string): number {
  const a = parseDateOnly(inicio);
  const b = parseDateOnly(fim);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
