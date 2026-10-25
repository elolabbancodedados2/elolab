import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Feedback, ListRow, Section, Stat, StateView, type Tone } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors, radius } from '../../theme/tokens';

type Task = { id: string; titulo: string; descricao: string | null; status: string; prioridade: string; categoria: string | null; data_vencimento: string | null; paciente_id: string | null; updated_at: string };
type Group = 'overdue' | 'today' | 'upcoming' | 'noDeadline' | 'completed';

const sections: { key: Group; title: string; tone: Tone }[] = [
  { key: 'overdue', title: 'Atrasadas', tone: 'danger' }, { key: 'today', title: 'Para hoje', tone: 'warning' }, { key: 'upcoming', title: 'Próximas', tone: 'primary' },
  { key: 'noDeadline', title: 'Sem prazo', tone: 'neutral' }, { key: 'completed', title: 'Concluídas e canceladas', tone: 'success' },
];
const statusLabel: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' };
const priority: Record<string, { label: string; tone: Tone; order: number }> = { urgente: { label: 'Urgente', tone: 'danger', order: 0 }, alta: { label: 'Alta', tone: 'warning', order: 1 }, media: { label: 'Média', tone: 'primary', order: 2 }, baixa: { label: 'Baixa', tone: 'neutral', order: 3 } };
const patientRoles = ['admin', 'recepcao', 'enfermagem', 'medico'];
const isOpen = (task: Task) => task.status !== 'concluida' && task.status !== 'cancelada';
const byDue = (a: Task, b: Task) => (a.data_vencimento || '9999-12-31').localeCompare(b.data_vencimento || '9999-12-31') || a.id.localeCompare(b.id);
const byPriority = (list: Task[]) => [...list].sort((a, b) => (priority[a.prioridade]?.order ?? 2) - (priority[b.prioridade]?.order ?? 2))[0];

/** Same grouping as the web personalTaskQueue. */
function groupTasks(tasks: Task[], today: string) {
  const g: Record<Group, Task[]> = { overdue: [], today: [], upcoming: [], noDeadline: [], completed: [] };
  for (const t of tasks) g[!isOpen(t) ? 'completed' : !t.data_vencimento ? 'noDeadline' : t.data_vencimento < today ? 'overdue' : t.data_vencimento === today ? 'today' : 'upcoming'].push(t);
  (['overdue', 'today', 'upcoming', 'noDeadline'] as const).forEach(k => g[k].sort(byDue));
  g.completed.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
  return g;
}

export default function MyQueueScreen() {
  const { session, profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const userId = session?.user.id;
  const canOpenPatient = Boolean(profile?.roles.some(role => patientRoles.includes(role)));
  const [hideDone, setHideDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const today = clinicDate();

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId || !userId) return undefined;
    // shortcut: one page of 1000 rows instead of the web's chunked fetch (20k); a personal queue rarely exceeds it.
    return (must(await client.from('tarefas').select('id,titulo,descricao,status,prioridade,categoria,data_vencimento,paciente_id,updated_at')
      .eq('clinica_id', clinicId).eq('responsavel_id', userId).order('data_vencimento', { ascending: true, nullsFirst: false }).order('id', { ascending: true }).limit(1000)) ?? []) as Task[];
  }, [clinicId, userId]);

  const tasks = data ?? [];
  const groups = groupTasks(tasks, today);
  const active = groups.overdue.length + groups.today.length + groups.upcoming.length + groups.noDeadline.length;
  const next = byPriority(groups.overdue) ?? byPriority(groups.today) ?? byPriority(groups.upcoming) ?? byPriority(groups.noDeadline) ?? null;
  const doneToday = groups.completed.filter(t => t.status === 'concluida' && clinicDateOf(t.updated_at) === today).length;
  const goal = doneToday + groups.today.length + groups.overdue.length;
  const progress = goal > 0 ? Math.round((doneToday / goal) * 100) : 0;

  async function update(task: Task, values: Record<string, unknown>, field: string, success: string) {
    if (!clinicId || !userId) return setFeedback({ message: 'Sua sessão expirou. Entre novamente para atualizar a tarefa.', error: true });
    setBusy(task.id);
    setFeedback(null);
    try {
      // Same guards as the web: own task, same clinic and unchanged version.
      const row = must(await db.from('tarefas').update(values).eq('id', task.id).eq('clinica_id', clinicId).eq('responsavel_id', userId).eq('updated_at', task.updated_at).select('id').maybeSingle());
      if (!row) throw new Error('Esta tarefa mudou desde a última atualização. Recarregue a fila e tente novamente.');
      // Audit trail like the web logAudit; ids only, a failure does not undo the change.
      await db.from('audit_log').insert({ action: 'update', collection: 'tarefas', record_id: task.id, changes: [{ field, oldValue: field === 'status' ? task.status : task.data_vencimento, newValue: values[field] }], user_id: userId }).then(() => undefined, () => undefined);
      setFeedback({ message: success });
    } catch (err) {
      setFeedback({ message: friendlyError(err, 'Não foi possível atualizar a tarefa'), error: true });
    } finally { setBusy(null); reload(); }
  }

  const start = (task: Task) => void update(task, { status: 'em_andamento' }, 'status', 'Tarefa iniciada');
  const finish = (task: Task) => void update(task, { status: 'concluida' }, 'status', 'Tarefa concluída');
  const postpone = (task: Task) => {
    const base = task.data_vencimento && task.data_vencimento > today ? task.data_vencimento : today;
    const d = new Date(`${base}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    const novo = d.toISOString().slice(0, 10);
    void update(task, { data_vencimento: novo }, 'data_vencimento', `Prazo movido para ${dateLabel(novo).slice(0, 5)}`);
  };

  const actions = (task: Task) => isOpen(task) ? <View style={styles.actions}>
    {task.status === 'pendente' ? <Button variant="secondary" icon="play" label="Iniciar" disabled={busy !== null} onPress={() => start(task)} /> : null}
    <Button icon="checkmark" label="Concluir" loading={busy === task.id} disabled={busy !== null} onPress={() => finish(task)} />
    <Button variant="ghost" icon="calendar-outline" label="Adiar para amanhã" disabled={busy !== null} onPress={() => postpone(task)} />
  </View> : null;

  return <ModuleScreen moduleKey="minha-fila" title="Minha fila de trabalho" subtitle="Tarefas atribuídas a você, organizadas por prazo." refreshing={refreshing} onRefresh={refresh}
    action={<Button variant="secondary" label="Equipe" icon="people-outline" onPress={() => router.push('/modules/tarefas')} />}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando fila de tarefas…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar sua fila" message={error} onAction={reload} /> :
      !tasks.length ? <StateView icon="list-outline" title="Sua fila está vazia" message="Quando uma tarefa for atribuída a você nesta clínica, ela aparecerá aqui." actionLabel="Abrir quadro da equipe" onAction={() => router.push('/modules/tarefas')} /> : <>
        <Card style={styles.hero}>
          <Text style={styles.eyebrow}>Próxima tarefa</Text>
          {next ? <>
            <View style={styles.heroHead}><Text style={styles.heroTitle}>{next.titulo}</Text><Badge label={groups.overdue.includes(next) ? 'Atrasada' : groups.today.includes(next) ? 'Para hoje' : priority[next.prioridade]?.label ?? 'Próxima'} tone={groups.overdue.includes(next) ? 'danger' : 'primary'} /></View>
            {next.descricao ? <Text style={styles.heroText}>{next.descricao}</Text> : null}
            <Text style={styles.heroMeta}>{[next.data_vencimento ? `Prazo ${dateLabel(next.data_vencimento)}` : null, next.categoria, statusLabel[next.status] ?? next.status].filter(Boolean).join(' · ')}</Text>
            {actions(next)}
          </> : <><Text style={styles.heroTitle}>Nada pendente na sua fila</Text><Text style={styles.heroText}>Tudo o que estava atribuído a você já foi resolvido.</Text></>}
        </Card>
        <Card style={styles.progress}>
          <Text style={styles.progressTitle}>Progresso do dia</Text>
          <Text style={styles.heroText}>{doneToday} de {goal} tarefas do dia concluídas</Text>
          <View accessibilityRole="progressbar" accessibilityLabel="Progresso do dia" accessibilityValue={{ min: 0, max: 100, now: progress }} style={styles.bar}><View style={[styles.barFill, { width: `${progress}%` }]} /></View>
          <Text style={styles.percent}>{progress}%</Text>
        </Card>
        <View style={styles.stats}>{sections.map(s => <Stat key={s.key} label={s.title} value={groups[s.key].length} tone={s.tone} />)}</View>
        {tasks.length >= 1000 ? <Feedback error message="A fila atingiu o limite de tarefas carregadas. Os contadores podem estar incompletos; fale com o suporte da clínica." /> : null}
        {active === 0 ? <Feedback message="Tudo em dia: suas atribuições estão concluídas ou canceladas." /> : null}
        {groups.completed.length ? <Button variant="ghost" icon={hideDone ? 'eye-outline' : 'eye-off-outline'} label={hideDone ? 'Mostrar concluídas' : 'Ocultar concluídas'} onPress={() => setHideDone(v => !v)} /> : null}
        {sections.map(s => !groups[s.key].length || (s.key === 'completed' && hideDone) ? null : <Section key={s.key} title={`${s.title} (${groups[s.key].length})`}>
          {groups[s.key].map(task => <View key={task.id} style={styles.task}>
            <ListRow title={task.titulo} subtitle={task.descricao} tone={s.tone}
              meta={[statusLabel[task.status] ?? task.status, task.data_vencimento ? dateLabel(task.data_vencimento) : null, task.categoria].filter(Boolean).join(' · ')}
              right={<Badge label={priority[task.prioridade]?.label ?? 'Média'} tone={priority[task.prioridade]?.tone ?? 'primary'} />} />
            {task.paciente_id ? canOpenPatient ? <Button variant="ghost" icon="person-outline" label="Abrir paciente" onPress={() => router.push({ pathname: '/patients/[patientId]', params: { patientId: task.paciente_id! } })} /> : <Text style={styles.linked}>Paciente vinculado</Text> : null}
            {s.key !== 'completed' ? actions(task) : null}
          </View>)}
        </Section>)}
      </>}
  </ModuleScreen>;
}

function clinicDateOf(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

const styles = StyleSheet.create({
  hero: { marginTop: 4, borderColor: colors.primary }, eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 }, heroTitle: { flex: 1, color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 4 }, heroText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }, heroMeta: { color: colors.primary, fontSize: 11, fontWeight: '700', marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10 }, progress: { marginTop: 12 }, progressTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  bar: { height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginTop: 12 }, barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.pill }, percent: { color: colors.ink, fontSize: 24, fontWeight: '300', marginTop: 6 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, task: { marginBottom: 6 }, linked: { color: colors.muted, fontSize: 11, paddingVertical: 8 },
});
