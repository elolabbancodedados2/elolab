import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, Segmented, StateView, type Tone } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError, parseDateBR } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Task = { id: string; titulo: string; descricao: string | null; status: string; prioridade: string | null; categoria: string | null; data_vencimento: string | null; responsavel_id: string | null; updated_at: string | null };
type Filter = 'abertas' | 'minhas' | 'fechadas';

const priorities = [{ value: 'urgente', label: 'Urgente' }, { value: 'alta', label: 'Alta' }, { value: 'media', label: 'Média' }, { value: 'baixa', label: 'Baixa' }];
const categories = ['Administrativo', 'Clínico', 'Financeiro', 'TI', 'Manutenção', 'RH', 'Outro'].map(value => ({ value, label: value }));
const priorityTone: Record<string, Tone> = { urgente: 'danger', alta: 'warning', media: 'primary', baixa: 'neutral' };
const statusLabel: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' };
const isOpen = (task: Task) => task.status !== 'concluida' && task.status !== 'cancelada';
const emptyForm = { titulo: '', descricao: '', prioridade: 'media', categoria: '', vencimento: '' };

export default function TasksScreen() {
  const { session, profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const userId = session?.user.id;
  const [filter, setFilter] = useState<Filter>('abertas');
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const today = clinicDate();

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [tasks, people] = await Promise.all([
      client.from('tarefas').select('id, titulo, descricao, status, prioridade, categoria, data_vencimento, responsavel_id, updated_at').eq('clinica_id', clinicId).order('created_at', { ascending: false }).limit(200),
      client.from('profiles').select('id, nome').eq('clinica_id', clinicId),
    ]);
    const names = new Map<string, string>((must(people) ?? []).map((p: { id: string; nome: string }) => [p.id, p.nome]));
    return { tasks: (must(tasks) ?? []) as Task[], names };
  }, [clinicId]);

  const tasks = (data?.tasks ?? []).filter(task => filter === 'fechadas' ? !isOpen(task) : isOpen(task) && (filter === 'abertas' || task.responsavel_id === userId));
  const overdue = (data?.tasks ?? []).filter(task => isOpen(task) && task.data_vencimento && task.data_vencimento < today).length;

  async function update(task: Task, changes: Record<string, unknown>, success: string) {
    if (!clinicId) return;
    setBusy(task.id);
    setFeedback(null);
    try {
      if ('status' in changes) changes.data_conclusao = changes.status === 'concluida' ? new Date().toISOString() : null;
      // Optimistic concurrency, same as the web: fail when someone changed the task meanwhile.
      let query = db.from('tarefas').update(changes).eq('id', task.id).eq('clinica_id', clinicId);
      query = task.updated_at ? query.eq('updated_at', task.updated_at) : query.is('updated_at', null);
      const row = must(await query.select('id').maybeSingle());
      if (!row) throw new Error('Esta tarefa foi alterada por outra pessoa. Atualize a lista e tente novamente.');
      setFeedback({ message: success });
      reload();
    } catch (err) {
      setFeedback({ message: friendlyError(err), error: true });
      reload();
    } finally { setBusy(null); }
  }

  function remove(task: Task) {
    Alert.alert('Excluir tarefa', `Excluir "${task.titulo}"? Esta ação não pode ser desfeita.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => void (async () => {
        setBusy(task.id);
        try {
          const rows = must(await db.from('tarefas').delete().eq('id', task.id).eq('clinica_id', clinicId).select('id'));
          if (!rows?.length) throw new Error('A tarefa não foi excluída. Seu perfil pode não ter permissão.');
          setFeedback({ message: 'Tarefa excluída.' });
          reload();
        } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { setBusy(null); }
      })() },
    ]);
  }

  async function create() {
    if (!form || !clinicId || !userId) return;
    const vencimento = form.vencimento.trim() ? parseDateBR(form.vencimento) : null;
    if (!form.titulo.trim()) return setFeedback({ message: 'Informe o título da tarefa.', error: true });
    if (form.vencimento.trim() && !vencimento) return setFeedback({ message: 'Use a data no formato DD/MM/AAAA.', error: true });
    setBusy('new');
    try {
      must(await db.from('tarefas').insert({ titulo: form.titulo.trim(), descricao: form.descricao.trim() || null, prioridade: form.prioridade, categoria: form.categoria || null, data_vencimento: vencimento, status: 'pendente', criado_por: userId, clinica_id: clinicId }));
      setForm(null);
      setFeedback({ message: 'Tarefa criada.' });
      reload();
    } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { setBusy(null); }
  }

  return <ModuleScreen moduleKey="tarefas" subtitle={overdue ? `${overdue} tarefa(s) vencida(s) aguardando ação.` : 'Organize as pendências da equipe.'} refreshing={refreshing} onRefresh={refresh}
    action={form ? null : <Button label="Nova" icon="add" onPress={() => { setForm(emptyForm); setFeedback(null); }} />}>
    {form ? <Card style={styles.form}>
      <Field label="Título" value={form.titulo} onChangeText={titulo => setForm({ ...form, titulo })} placeholder="O que precisa ser feito?" />
      <Field label="Descrição" value={form.descricao} onChangeText={descricao => setForm({ ...form, descricao })} multiline />
      <Chips label="Prioridade" options={priorities} value={form.prioridade} onChange={prioridade => setForm({ ...form, prioridade })} />
      <Chips label="Categoria" options={categories} value={form.categoria || null} onChange={categoria => setForm({ ...form, categoria })} />
      <Field label="Vencimento" value={form.vencimento} onChangeText={vencimento => setForm({ ...form, vencimento })} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" hint="Opcional" />
      <View style={styles.actions}><Button variant="ghost" label="Cancelar" onPress={() => setForm(null)} /><Button label="Criar tarefa" icon="checkmark" loading={busy === 'new'} onPress={() => void create()} /></View>
    </Card> : null}
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <Segmented options={[{ value: 'abertas', label: 'Abertas' }, { value: 'minhas', label: 'Minhas' }, { value: 'fechadas', label: 'Encerradas' }]} value={filter} onChange={setFilter} />
    {loading ? <StateView loading title="Carregando tarefas…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} /> : !tasks.length ? <StateView icon="checkmark-done-outline" title="Nada por aqui" message={filter === 'fechadas' ? 'Nenhuma tarefa encerrada.' : 'Nenhuma tarefa aberta neste filtro.'} /> :
      <Section title={`${tasks.length} tarefa(s)`}>{tasks.map(task => {
        const late = isOpen(task) && task.data_vencimento && task.data_vencimento < today;
        const owner = task.responsavel_id ? data?.names.get(task.responsavel_id) : null;
        return <View key={task.id} style={styles.task}>
          <ListRow title={task.titulo} subtitle={task.descricao} meta={[statusLabel[task.status] ?? task.status, owner ? `Responsável: ${owner}` : 'Sem responsável', task.data_vencimento ? `Vence ${dateLabel(task.data_vencimento)}` : null].filter(Boolean).join(' · ')}
            right={<Badge label={late ? 'Vencida' : priorities.find(p => p.value === task.prioridade)?.label ?? 'Média'} tone={late ? 'danger' : priorityTone[task.prioridade ?? 'media']} />} />
          <View style={styles.taskActions}>
            {isOpen(task) && !task.responsavel_id ? <Button variant="secondary" label="Assumir" disabled={busy === task.id} onPress={() => void update(task, { responsavel_id: userId }, 'Tarefa assumida.')} /> : null}
            {task.status === 'pendente' ? <Button variant="secondary" label="Iniciar" disabled={busy === task.id} onPress={() => void update(task, { status: 'em_andamento' }, 'Tarefa iniciada.')} /> : null}
            {task.status === 'em_andamento' ? <Button label="Concluir" disabled={busy === task.id} onPress={() => void update(task, { status: 'concluida' }, 'Tarefa concluída.')} /> : null}
            {isOpen(task) ? <Button variant="ghost" label="Cancelar" disabled={busy === task.id} onPress={() => void update(task, { status: 'cancelada' }, 'Tarefa cancelada.')} /> : <Button variant="secondary" label="Reabrir" disabled={busy === task.id} onPress={() => void update(task, { status: 'pendente' }, 'Tarefa reaberta.')} />}
            <Button variant="danger" label="Excluir" disabled={busy === task.id} onPress={() => remove(task)} />
          </View>
        </View>;
      })}</Section>}
    <Text style={styles.note}>Alterações feitas por outra pessoa são detectadas antes de salvar.</Text>
  </ModuleScreen>;
}

const styles = StyleSheet.create({ form: { marginBottom: 6 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }, task: { marginBottom: 6 }, taskActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 }, note: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 16 } });
