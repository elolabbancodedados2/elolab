/**
 * Horários de agendamento feitos pelo próprio paciente (portal e link público).
 *
 * `validarHorario` confere um horário escolhido; `horariosLivres` lista só os
 * que passariam nessa mesma validação. Antes a lista ignorava bloqueios de
 * agenda, consultas sobrepostas (só comparava o horário exato de início) e
 * horários de hoje que já passaram — o paciente escolhia, confirmava e só
 * então recebia "horário bloqueado/ocupado".
 */

export function timeToMinutes(value: unknown): number | null {
  const match = String(value ?? '').match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60 ? hour * 60 + minute : null;
}

function minutesToTime(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Data ("YYYY-MM-DD") e minutos do dia agora, no fuso de Brasília. */
export function agoraEmBrasilia(instant: Date = new Date()): { data: string; minutos: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? '00';
  return { data: `${get('year')}-${get('month')}-${get('day')}`, minutos: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}

export function dataValida(date: string): boolean {
  const d = new Date(`${date}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** True when the consultation start is at or before the current Brasília time. */
export function horarioConsultaPassou(date: string, time: string, instant: Date = new Date()): boolean {
  if (!dataValida(date)) return true;
  const now = agoraEmBrasilia(instant);
  if (date < now.data) return true;
  if (date > now.data || !time) return false;
  const start = timeToMinutes(time);
  return start === null || start <= now.minutos;
}

interface Jornada { inicio: number; fim: number; duracao: number; passo: number }

async function jornadasDoDia(db: any, medicoId: string, date: string): Promise<Jornada[]> {
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
  const { data, error } = await db
    .from('medico_disponibilidade')
    .select('hora_inicio, hora_fim, duracao_consulta, intervalo_consultas')
    .eq('medico_id', medicoId)
    .eq('dia_semana', dayOfWeek)
    .eq('ativo', true)
    .order('hora_inicio', { ascending: true })
    .order('hora_fim', { ascending: true })
    .order('duracao_consulta', { ascending: true })
    .order('intervalo_consultas', { ascending: true });
  if (error) throw error;
  if (!data) return [];
  return data.flatMap((row: any): Jornada[] => {
    const inicio = timeToMinutes(row.hora_inicio);
    const fim = timeToMinutes(row.hora_fim);
    const duracao = Number(row.duracao_consulta) || 30;
    const passo = duracao + (Number(row.intervalo_consultas) || 0);
    if (inicio === null || fim === null || inicio >= fim || passo <= 0 || duracao > fim - inicio) return [];
    return [{ inicio, fim, duracao, passo }];
  });
}

async function ocupacoesDoDia(db: any, clinicId: string, medicoId: string, date: string, ignoreAppointmentId?: string) {
  const [{ data: blocks, error: blocksError }, { data: appointments, error: appointmentsError }] = await Promise.all([
    db.from('bloqueios_agenda').select('hora_inicio, hora_fim, dia_inteiro')
      .eq('medico_id', medicoId).lte('data_inicio', date).gte('data_fim', date),
    db.from('agendamentos').select('id, hora_inicio, hora_fim')
      .eq('medico_id', medicoId).eq('clinica_id', clinicId).eq('data', date)
      .not('status', 'in', '("cancelado")'),
  ]);
  if (blocksError) throw blocksError;
  if (appointmentsError) throw appointmentsError;

  const bloqueioDiaInteiro = (blocks || []).some((b: any) => b.dia_inteiro);
  const intervalos: Array<{ ini: number; fim: number; tipo: 'bloqueio' | 'consulta' }> = [];
  for (const b of blocks || []) {
    const ini = timeToMinutes(b.hora_inicio);
    const fim = timeToMinutes(b.hora_fim);
    if (ini !== null && fim !== null) intervalos.push({ ini, fim, tipo: 'bloqueio' });
  }
  for (const a of appointments || []) {
    if (a.id === ignoreAppointmentId) continue;
    const ini = timeToMinutes(a.hora_inicio);
    if (ini === null) continue;
    intervalos.push({ ini, fim: timeToMinutes(a.hora_fim) ?? ini + 30, tipo: 'consulta' });
  }
  return { bloqueioDiaInteiro, intervalos };
}

/** Confere formato, jornada, bloqueio, sobreposição e horário passado. */
export async function validarHorario(
  db: any,
  clinicId: string | null,
  medicoId: string,
  date: string,
  startTime: string,
  ignoreAppointmentId?: string,
): Promise<{ error: string | null; duration: number }> {
  if (!dataValida(date)) return { error: 'Informe uma data válida.', duration: 30 };
  const start = timeToMinutes(startTime);
  if (start === null) return { error: 'Informe um horário válido.', duration: 30 };

  const agora = agoraEmBrasilia();
  if (date < agora.data || (date === agora.data && start <= agora.minutos)) {
    return { error: 'Este horário já passou. Escolha outro.', duration: 30 };
  }

  const jornadas = await jornadasDoDia(db, medicoId, date);
  if (jornadas.length === 0) return { error: 'O médico não tem disponibilidade neste dia.', duration: 30 };
  const jornadasQueComportamConsulta = jornadas.filter((jornada) =>
    start >= jornada.inicio && start + jornada.duracao <= jornada.fim
  );
  if (jornadasQueComportamConsulta.length === 0) {
    return { error: 'O horário está fora da disponibilidade do médico.', duration: jornadas[0].duracao };
  }
  const jornadasAlinhadas = jornadasQueComportamConsulta.filter((item) => (start - item.inicio) % item.passo === 0);
  if (jornadasAlinhadas.length === 0) {
    return { error: 'Escolha um horário disponível na agenda.', duration: jornadasQueComportamConsulta[0].duracao };
  }

  const { bloqueioDiaInteiro, intervalos } = await ocupacoesDoDia(db, clinicId ?? '', medicoId, date, ignoreAppointmentId);
  if (bloqueioDiaInteiro) {
    return { error: 'O horário está bloqueado para este médico.', duration: jornadasAlinhadas[0].duracao };
  }
  const jornadasSemBloqueio = jornadasAlinhadas.filter((item) =>
    !intervalos.some((i) => i.tipo === 'bloqueio' && i.ini < start + item.duracao && i.fim > start)
  );
  if (jornadasSemBloqueio.length === 0) {
    return { error: 'O horário está bloqueado para este médico.', duration: jornadasAlinhadas[0].duracao };
  }
  const jornadaLivre = jornadasSemBloqueio.find((item) =>
    !intervalos.some((i) => i.tipo === 'consulta' && i.ini < start + item.duracao && i.fim > start)
  );
  if (!jornadaLivre) {
    return { error: 'Este horário já está ocupado.', duration: jornadasSemBloqueio[0].duracao };
  }
  return { error: null, duration: jornadaLivre.duracao };
}

/** Horários ("HH:MM") que `validarHorario` aceitaria para o médico nesta data. */
export async function horariosLivres(db: any, clinicId: string, medicoId: string, date: string, ignoreAppointmentId?: string): Promise<string[]> {
  if (!dataValida(date)) return [];
  const agora = agoraEmBrasilia();
  if (date < agora.data) return [];

  const jornadas = await jornadasDoDia(db, medicoId, date);
  if (jornadas.length === 0) return [];
  const { bloqueioDiaInteiro, intervalos } = await ocupacoesDoDia(db, clinicId, medicoId, date, ignoreAppointmentId);
  if (bloqueioDiaInteiro) return [];

  const candidatos = new Set<number>();
  for (const jornada of jornadas) {
    for (let ini = jornada.inicio; ini + jornada.duracao <= jornada.fim; ini += jornada.passo) {
      candidatos.add(ini);
    }
  }
  const livres: string[] = [];
  for (const ini of [...candidatos].sort((a, b) => a - b)) {
    if (date === agora.data && ini <= agora.minutos) continue;
    const jornadasQueComportamConsulta = jornadas.filter((jornada) =>
      ini >= jornada.inicio
        && ini + jornada.duracao <= jornada.fim
        && (ini - jornada.inicio) % jornada.passo === 0
    );
    const jornadaLivre = jornadasQueComportamConsulta.find((jornada) =>
      !intervalos.some((i) => i.tipo === 'bloqueio' && i.ini < ini + jornada.duracao && i.fim > ini)
        && !intervalos.some((i) => i.tipo === 'consulta' && i.ini < ini + jornada.duracao && i.fim > ini)
    );
    if (!jornadaLivre) continue;
    livres.push(minutesToTime(ini));
  }
  return livres;
}
