import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Stat, StateView, type Tone } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError, parseDateBR } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Return = { id: string; paciente_id: string; medico_id: string | null; data_retorno_prevista: string; status: string | null; motivo: string | null; agendamento_retorno_id: string | null; clinica_id: string; pacientes: { nome: string | null; nome_social: string | null; telefone: string | null } | null; medicos: { nome: string | null; crm: string | null } | null };
type Appt = { id: string; data: string; hora_inicio: string; status: string };
type Filter = 'todos' | 'atrasado' | 'pendente' | 'proximos7' | 'agendado' | 'realizado' | 'cancelado';
type Scheduling = { item: Return; date: string; time: string };

const statusInfo: Record<string, { label: string; tone: Tone }> = { atrasado: { label: 'Atrasado', tone: 'danger' }, pendente: { label: 'Pendente', tone: 'warning' }, agendado: { label: 'Agendado', tone: 'primary' }, realizado: { label: 'Realizado', tone: 'success' }, cancelado: { label: 'Cancelado', tone: 'neutral' } };
const filters: { value: Filter; label: string }[] = [{ value: 'todos', label: 'Todos' }, { value: 'atrasado', label: 'Atrasados' }, { value: 'pendente', label: 'Pendentes' }, { value: 'proximos7', label: 'Próximos 7 dias' }, { value: 'agendado', label: 'Agendados' }, { value: 'realizado', label: 'Realizados' }, { value: 'cancelado', label: 'Cancelados' }];
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
const minutes = (v?: string | null) => { if (!v || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v)) return null; const [h, m] = v.split(':').map(Number); return h * 60 + m; };
const nameOf = (r: Return) => r.pacientes?.nome_social?.trim() || r.pacientes?.nome || 'Paciente';
const doctorOf = (r: Return) => r.medicos?.nome || r.medicos?.crm || 'Médico';
const timeReached = (data: string, hora: string) => /^\d{4}-\d{2}-\d{2}$/.test(data) && /^\d{2}:\d{2}/.test(hora) && new Date(`${data}T${hora.slice(0, 5)}:00-03:00`) <= new Date();

export default function ReturnsScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const medicoOnly = Boolean(profile?.roles.includes('medico') && !profile.roles.some(r => ['admin', 'recepcao', 'enfermagem'].includes(r)));
  const [filter, setFilter] = useState<Filter>('todos');
  const [mineChoice, setMineChoice] = useState<boolean | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [sched, setSched] = useState<Scheduling | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const today = clinicDate();

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [rows, me] = await Promise.all([
      client.from('retornos').select('id, paciente_id, medico_id, data_retorno_prevista, status, motivo, agendamento_retorno_id, clinica_id, pacientes(nome, nome_social, telefone), medicos(nome, crm)').eq('clinica_id', clinicId).order('data_retorno_prevista', { ascending: true }).limit(5000),
      client.rpc('buscar_medico_atual'),
    ]);
    const returns = (must(rows) ?? []) as Return[];
    const myDoctorId: string | null = me.error ? null : me.data?.[0]?.id ?? null;
    const ids = [...new Set(returns.filter(r => r.data_retorno_prevista <= today && !['realizado', 'cancelado'].includes(r.status || '') && r.agendamento_retorno_id).map(r => r.agendamento_retorno_id as string))];
    const appts = ids.length ? (must(await client.from('agendamentos').select('id, data, hora_inicio, status').eq('clinica_id', clinicId).in('id', ids)) ?? []) as Appt[] : [];
    return { returns, myDoctorId, appts: new Map(appts.map(a => [a.id, a])) };
  }, [clinicId, today]);

  const mine = Boolean(data?.myDoctorId) && (mineChoice ?? medicoOnly);
  const all = (data?.returns ?? []).map(r => {
    const late = days(r.data_retorno_prevista, today);
    const base = r.status || 'pendente';
    return { ...r, calc: ['pendente', 'agendado'].includes(base) && r.data_retorno_prevista < today ? 'atrasado' : base, late };
  });
  const scoped = all.filter(r => !mine || r.medico_id === data?.myDoctorId);
  const in7 = (r: (typeof all)[number]) => r.late <= 0 && r.late >= -7 && !['realizado', 'cancelado'].includes(r.calc);
  const q = search.trim().toLowerCase();
  const shown = scoped.filter(r => (filter === 'todos' || (filter === 'proximos7' ? in7(r) : r.calc === filter))
    && (!q || [nameOf(r), doctorOf(r), r.motivo].some(v => (v ?? '').toLowerCase().includes(q))));
  const count = (s: string) => scoped.filter(r => r.calc === s).length;
  const dueOnes = scoped.filter(r => r.calc !== 'cancelado' && r.data_retorno_prevista < today);
  const attendance = dueOnes.length ? Math.round((dueOnes.filter(r => r.calc === 'realizado').length / dueOnes.length) * 100) : 0;

  async function run(id: string, work: () => Promise<string>) {
    setBusy(id); setFeedback(null);
    try { setFeedback({ message: await work() }); } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { setBusy(null); reload(); }
  }

  const markDone = (r: Return) => Alert.alert('Marcar retorno como realizado', `Confirmar que ${nameOf(r)} compareceu ao retorno previsto para ${dateLabel(r.data_retorno_prevista)}?`, [
    { text: 'Voltar', style: 'cancel' },
    { text: 'Sim, foi realizado', onPress: () => void run(r.id, async () => {
      const ok = must(await db.rpc('marcar_retorno_realizado_atomico', { p_retorno_id: r.id }));
      if (!ok) throw new Error('O retorno mudou ou o agendamento ainda não terminou. Atualize a lista antes de confirmar a presença.');
      return 'Retorno marcado como realizado';
    }) },
  ]);

  const reopen = (r: Return) => void run(r.id, async () => {
    const row = must(await db.from('retornos').update({ status: 'pendente' }).eq('id', r.id).eq('clinica_id', r.clinica_id).eq('status', 'realizado').select('id').maybeSingle());
    if (!row) throw new Error('O retorno mudou desde que foi aberto. Atualize a lista antes de reabri-lo.');
    return 'Retorno reaberto como pendente';
  });

  const cancel = (r: Return) => Alert.alert('Cancelar retorno', `Cancelar o retorno de ${nameOf(r)}? O horário vinculado também será cancelado.`, [
    { text: 'Voltar', style: 'cancel' },
    { text: 'Cancelar retorno', style: 'destructive', onPress: () => void run(r.id, async () => {
      const ok = must(await db.rpc('cancelar_retorno_atomico', { p_retorno_id: r.id }));
      if (!ok) throw new Error('O retorno já foi realizado, cancelado ou não está disponível para alteração. Atualize a lista.');
      return 'Retorno cancelado';
    }) },
  ]);

  async function openScheduling(r: Return) {
    if (!r.agendamento_retorno_id) return setSched({ item: r, date: dateLabel(r.data_retorno_prevista), time: '09:00' });
    setBusy(r.id);
    try {
      const appt = must(await db.from('agendamentos').select('data, hora_inicio').eq('id', r.agendamento_retorno_id).eq('clinica_id', r.clinica_id).single());
      setSched({ item: r, date: dateLabel(appt.data), time: appt.hora_inicio?.slice(0, 5) || '09:00' });
    } catch (err) { setFeedback({ message: friendlyError(err, 'Erro ao carregar o agendamento.'), error: true }); } finally { setBusy(null); }
  }

  /** Mirrors the web conflict check; returns an out-of-hours warning or null. */
  async function checkSlot(r: Return, date: string, time: string, checkHours: boolean) {
    const start = minutes(time);
    const end = start === null ? null : start + 30;
    if (start === null || end === null || end >= 1440) throw new Error('Informe um horário válido que termine antes da meia-noite.');
    const sameDay = must(await db.from('agendamentos').select('id, paciente_id, medico_id, hora_inicio, hora_fim, status').eq('clinica_id', r.clinica_id).eq('data', date)) ?? [];
    let doctorClash = false, patientClash = false;
    for (const a of sameDay as { id: string; paciente_id: string; medico_id: string; hora_inicio: string; hora_fim: string | null; status: string }[]) {
      if (['cancelado', 'faltou'].includes(a.status) || a.id === r.agendamento_retorno_id) continue;
      const s = minutes(a.hora_inicio); if (s === null) continue;
      const e = minutes(a.hora_fim) ?? s + 30;
      if (s >= end || e <= start) continue;
      if (a.medico_id === r.medico_id) doctorClash = true;
      if (a.paciente_id === r.paciente_id) patientClash = true;
    }
    if (doctorClash) throw new Error('Este médico já tem uma consulta neste horário. Escolha outro horário.');
    if (patientClash) throw new Error('Este paciente já tem outro atendimento neste horário. Escolha outro horário.');
    const blocks = must(await db.from('bloqueios_agenda').select('id, hora_inicio, hora_fim, dia_inteiro, motivo, tipo').eq('clinica_id', r.clinica_id).eq('medico_id', r.medico_id).lte('data_inicio', date).gte('data_fim', date)) ?? [];
    const block = (blocks as { dia_inteiro: boolean; hora_inicio: string | null; hora_fim: string | null; motivo: string | null; tipo: string | null }[]).find(b => {
      if (b.dia_inteiro) return true;
      const bs = minutes(b.hora_inicio), be = minutes(b.hora_fim);
      return bs !== null && be !== null && bs < end && be > start;
    });
    if (block) throw new Error(`Horário bloqueado para este médico${block.motivo ? `: ${block.motivo}` : block.tipo ? `: ${block.tipo}` : '.'}`);
    if (!checkHours) return null;
    const shifts = (must(await db.from('medico_disponibilidade').select('hora_inicio, hora_fim').eq('medico_id', r.medico_id).eq('dia_semana', new Date(`${date}T12:00:00Z`).getUTCDay()).eq('ativo', true)) ?? []) as { hora_inicio: string; hora_fim: string }[];
    if (shifts.some(j => { const js = minutes(j.hora_inicio), je = minutes(j.hora_fim); return js !== null && je !== null && start >= js && end <= je; })) return null;
    const ranges = shifts.map(j => `${String(j.hora_inicio).slice(0, 5)}–${String(j.hora_fim).slice(0, 5)}`).join(', ');
    return ranges ? `O expediente cadastrado do médico neste dia é ${ranges}.` : 'O médico não tem expediente cadastrado neste dia da semana.';
  }

  async function confirmSchedule(outsideHoursOk = false) {
    if (!sched) return;
    const date = parseDateBR(sched.date);
    if (!date) return setFeedback({ message: 'Use a data no formato DD/MM/AAAA.', error: true });
    if (date < today) return setFeedback({ message: 'Escolha uma data a partir de hoje.', error: true });
    if (!/^\d{2}:\d{2}$/.test(sched.time)) return setFeedback({ message: 'Informe um horário para o agendamento (HH:MM).', error: true });
    const { item, time } = sched;
    setBusy('sched'); setFeedback(null);
    try {
      const warning = await checkSlot(item, date, time, !outsideHoursOk);
      if (warning) {
        setBusy(null);
        return Alert.alert('Fora do expediente do médico', `${warning} O horário escolhido é ${time}. Deseja agendar mesmo assim?`, [
          { text: 'Escolher outro horário', style: 'cancel' }, { text: 'Agendar mesmo assim', onPress: () => void confirmSchedule(true) },
        ]);
      }
      const id = must(await db.rpc('agendar_retorno_atomico', { p_retorno_id: item.id, p_data: date, p_hora: time, p_confirmou_fora_expediente: outsideHoursOk }));
      if (!id) throw new Error('O retorno não foi vinculado a um horário. Atualize a lista e tente novamente.');
      setSched(null);
      setFeedback({ message: `${item.agendamento_retorno_id ? 'Retorno remarcado' : 'Retorno agendado'} para ${dateLabel(date)} às ${time}` });
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err, 'Não foi possível agendar o retorno.'), error: true }); } finally { setBusy(null); }
  }

  return <ModuleScreen moduleKey="retornos" title="Controle de Retornos" subtitle={scoped.length ? `${count('atrasado')} atrasado(s) · ${scoped.filter(in7).length} nos próximos 7 dias${mine ? ' · só os meus' : ''}` : 'Acompanhe retornos pendentes e atrasados'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {sched ? <Card style={styles.form}>
      <Text style={styles.formTitle}>{sched.item.agendamento_retorno_id ? 'Remarcar Retorno' : 'Agendar Retorno'}</Text>
      <Text style={styles.note}>{nameOf(sched.item)} · {doctorOf(sched.item)}{sched.item.motivo ? `\nMotivo: ${sched.item.motivo}` : ''}</Text>
      <Field label="Data do Agendamento" value={sched.date} onChangeText={date => setSched({ ...sched, date })} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" />
      <Field label="Horário" value={sched.time} onChangeText={time => setSched({ ...sched, time })} placeholder="HH:MM" keyboardType="numbers-and-punctuation" />
      <View style={styles.actions}><Button variant="ghost" label="Cancelar" disabled={busy === 'sched'} onPress={() => setSched(null)} /><Button icon="calendar-outline" label={sched.item.agendamento_retorno_id ? 'Confirmar Remarcação' : 'Confirmar Agendamento'} loading={busy === 'sched'} onPress={() => void confirmSchedule()} /></View>
    </Card> : null}
    {loading ? <StateView loading title="Carregando retornos…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar o controle de retornos" message={error} onAction={reload} /> : <>
      <View style={styles.stats}>
        <Stat label="Atrasados" value={count('atrasado')} tone="danger" onPress={() => setFilter(f => f === 'atrasado' ? 'todos' : 'atrasado')} />
        <Stat label="Pendentes" value={count('pendente')} tone="warning" onPress={() => setFilter(f => f === 'pendente' ? 'todos' : 'pendente')} />
        <Stat label="Próximos 7 dias" value={scoped.filter(in7).length} tone="primary" onPress={() => setFilter(f => f === 'proximos7' ? 'todos' : 'proximos7')} />
        <Stat label={`Realizados · ${attendance}% de comparecimento`} value={count('realizado')} tone="success" onPress={() => setFilter(f => f === 'realizado' ? 'todos' : 'realizado')} />
      </View>
      {data?.myDoctorId ? <Chips label="Escopo" options={[{ value: 'meus', label: 'Meus retornos' }, { value: 'clinica', label: 'Toda a clínica' }]} value={mine ? 'meus' : 'clinica'} onChange={v => setMineChoice(v === 'meus')} /> : null}
      <Chips label="Status" options={filters} value={filter} onChange={setFilter} />
      <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Paciente, médico ou motivo" />
      {(data?.returns.length ?? 0) >= 5000 ? <Feedback error message="A lista atingiu o limite de retornos carregados. A lista e os indicadores podem estar incompletos." /> : null}
      {!shown.length ? <StateView icon="calendar-outline" title="Nenhum retorno encontrado" message={scoped.length ? 'Limpe a busca ou o filtro para ver mais retornos.' : 'Os retornos indicados ao finalizar atendimentos aparecerão aqui.'} /> :
        <Section title={`${shown.length} retorno(s)`}>{shown.map(r => {
          const open = !['realizado', 'cancelado'].includes(r.calc);
          const appt = r.agendamento_retorno_id ? data?.appts.get(r.agendamento_retorno_id) : undefined;
          const future = r.data_retorno_prevista > today;
          const notYet = Boolean(r.data_retorno_prevista === today && r.agendamento_retorno_id && (!appt || !timeReached(appt.data, appt.hora_inicio)));
          const noShow = ['cancelado', 'faltou'].includes(appt?.status || '');
          const stillOpen = Boolean(r.agendamento_retorno_id && !['finalizado', 'atendimento_finalizado'].includes((appt?.status || '').toLowerCase()));
          const phone = (r.pacientes?.telefone ?? '').replace(/\D/g, '');
          const wa = phone.length >= 10 ? `https://wa.me/${phone.startsWith('55') && phone.length >= 12 ? phone : `55${phone}`}?text=${encodeURIComponent(`Olá, ${nameOf(r).split(' ')[0]}! Seu retorno com ${doctorOf(r)} está previsto para ${dateLabel(r.data_retorno_prevista)}. Podemos confirmar o horário?`)}` : null;
          const info = statusInfo[r.calc] ?? { label: r.calc, tone: 'neutral' as Tone };
          return <View key={r.id} style={styles.item}>
            <ListRow title={nameOf(r)} subtitle={[doctorOf(r), r.motivo].filter(Boolean).join(' · ')} tone={info.tone}
              meta={`${dateLabel(r.data_retorno_prevista)}${r.calc === 'atrasado' ? ` · ${r.late} dia(s) de atraso${r.late > 30 ? ' (+30 dias)' : ''}` : ''}`} right={<Badge label={info.label} tone={info.tone} />} />
            {open && stillOpen && !noShow ? <Text style={styles.hint}>Conclua o atendimento antes de marcar como realizado</Text> : null}
            {open && (future || notYet) ? <Text style={styles.hint}>{notYet ? 'Disponível após o horário agendado' : 'Disponível na data prevista'}</Text> : null}
            {open && noShow ? <Text style={styles.hint}>Agendamento cancelado ou falta</Text> : null}
            <View style={styles.actions}>
              {(r.calc === 'pendente' || r.calc === 'atrasado') && !r.agendamento_retorno_id ? <Button icon="calendar-outline" label="Agendar" disabled={busy !== null} onPress={() => void openScheduling(r)} /> : null}
              {r.agendamento_retorno_id && open ? <Button variant="secondary" icon="refresh" label="Remarcar" loading={busy === r.id} disabled={busy !== null} onPress={() => void openScheduling(r)} /> : null}
              {open && !future && !notYet && !noShow && !stillOpen ? <Button icon="checkmark-circle-outline" label="Realizado" disabled={busy !== null} onPress={() => markDone(r)} /> : null}
              {r.calc === 'realizado' ? <Button variant="secondary" icon="arrow-undo-outline" label="Reabrir" disabled={busy !== null} onPress={() => reopen(r)} /> : null}
              {open ? <Button variant="ghost" label="Cancelar" disabled={busy !== null} onPress={() => cancel(r)} /> : null}
              {wa ? <Button variant="ghost" icon="logo-whatsapp" label="WhatsApp" onPress={() => void Linking.openURL(wa)} /> : null}
            </View>
          </View>;
        })}</Section>}
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }, item: { marginBottom: 6 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  hint: { color: colors.muted, fontSize: 11, paddingTop: 6 }, form: { marginBottom: 10 }, formTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginVertical: 8 },
});
