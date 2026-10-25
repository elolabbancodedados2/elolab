import { router, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, Section, StateView, Stat } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Frequency = 'daily' | 'weekly' | 'monthly';
type Filter = 'todos' | 'ativos' | 'pausados' | 'falha';
type Schedule = { id: string; name: string; recipients: string[]; frequency: Frequency; active: boolean; next_run_at: string; last_run_at: string | null };
type Run = { id: string; schedule_id: string; status: 'success' | 'error'; recipients_count: number; error: string | null; created_at: string };

const frequencyLabels: Record<Frequency, string> = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' };
const when = (v: string | null) => (v ? dateLabel(v) : 'Ainda não executado');

// Same rules as the web form: comma separated, deduplicated case-insensitively, each one validated.
function parseRecipients(value: string) {
  const entries = value.split(',').map(e => e.trim()).filter(Boolean);
  const recipients = [...new Map(entries.map(e => [e.toLocaleLowerCase('pt-BR'), e])).values()];
  return { recipients, invalid: recipients.filter(e => !/^[^\s@,]+@[^\s@,]+\.[^\s@.,]+$/.test(e)) };
}

export default function AdminScheduledReportsScreen() {
  const lock = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('todos');
  const [name, setName] = useState('Resumo executivo EloLab');
  const [recipientsInput, setRecipientsInput] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const parsed = parseRecipients(recipientsInput);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    const [schedules, runs] = await Promise.all([
      client.from('platform_report_schedules').select('*').order('created_at', { ascending: false }),
      client.from('platform_report_runs').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    return { schedules: (must(schedules) ?? []) as Schedule[], runs: (must(runs) ?? []) as Run[] };
  }, []);

  const all = data?.schedules ?? [];
  const runsOf = (id: string) => (data?.runs ?? []).filter(r => r.schedule_id === id);
  const lastFailed = (s: Schedule) => runsOf(s.id)[0]?.status === 'error';
  const matches = (s: Schedule, f: Filter) => f === 'todos' || (f === 'ativos' ? s.active : f === 'pausados' ? !s.active : lastFailed(s));
  const countOf = (f: Filter) => all.filter(s => matches(s, f)).length;
  const visible = all.filter(s => matches(s, filter));
  const formValid = name.trim().length >= 3 && name.trim().length <= 120 && parsed.recipients.length >= 1 && parsed.recipients.length <= 20 && !parsed.invalid.length;

  async function run(key: string, action: () => Promise<{ message: string; error?: boolean }>) {
    if (lock.current) return;
    lock.current = true; setBusy(key); setFeedback(null);
    try { setFeedback(await action()); } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { lock.current = false; setBusy(null); reload(); }
  }

  function runNow(s: Schedule) {
    Alert.alert('Enviar relatório agora?', `“${s.name}” será enviado agora para ${s.recipients.length} destinatário(s): ${s.recipients.join(', ')}. Depois do envio, o próximo horário automático será recalculado conforme a frequência ${frequencyLabels[s.frequency].toLowerCase()}. O resumo contém dados agregados da plataforma, sem dados clínicos.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar envio', onPress: () => void run(`run-${s.id}`, async () => {
        const { data: res, error: err } = await db.functions.invoke('platform-reports-runner', { body: { id: s.id } });
        if (err) throw err;
        if (res?.error) throw new Error(res.error);
        const result = (res?.results || []).find((item: { schedule_id: string }) => item.schedule_id === s.id) as { status: string; error?: string; warning?: string } | undefined;
        if (!result) throw new Error('O serviço não confirmou a execução deste agendamento. Atualize o histórico para conferir.');
        if (result.status === 'error') return { message: `O relatório não foi enviado. ${[result.error || 'Confira a execução registrada e tente novamente.', result.warning].filter(Boolean).join(' ')}`, error: true };
        if (result.warning) return { message: `O e-mail foi enviado, mas o histórico ficou incompleto. ${result.warning}`, error: true };
        return { message: 'Relatório enviado com sucesso.' };
      }) },
    ]);
  }

  return <ModuleScreen moduleKey="admin-relatorios-agendados" subtitle={all.length ? `${all.length} agendamentos · ${countOf('ativos')} ativos · ${countOf('falha')} com falha na última execução. Dados agregados, sem dados clínicos.` : 'O resumo executivo inclui dados agregados da plataforma e não contém dados clínicos.'} refreshing={refreshing} onRefresh={refresh}
    action={<Button variant="secondary" label="Ver relatório" onPress={() => router.push('/modules/admin-executivo' as Href)} />}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {all.length ? <View style={styles.stats}>
      <Stat label="Agendamentos" value={countOf('todos')} onPress={() => setFilter('todos')} />
      <Stat label="Ativos" value={countOf('ativos')} tone="success" onPress={() => setFilter('ativos')} />
      <Stat label="Pausados" value={countOf('pausados')} tone="neutral" onPress={() => setFilter('pausados')} />
      <Stat label="Última execução falhou" value={countOf('falha')} tone="danger" onPress={() => setFilter('falha')} />
    </View> : null}
    <Card style={styles.form}>
      <Text style={styles.title}>Novo agendamento</Text>
      <Text style={styles.note}>Informe até 20 e-mails separados por vírgula. Todos precisam ser válidos. A frequência mensal mantém o dia do calendário em que o agendamento foi criado.</Text>
      <Field label="Nome do relatório" value={name} maxLength={120} onChangeText={setName} placeholder="Resumo executivo EloLab" />
      <Field label="Destinatários" value={recipientsInput} onChangeText={setRecipientsInput} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="diretoria@empresa.com, financeiro@empresa.com"
        error={parsed.invalid.length ? `E-mail inválido: ${parsed.invalid.join(', ')}` : parsed.recipients.length > 20 ? `O limite é de 20 destinatários. Remova ${parsed.recipients.length - 20} e-mail(s).` : undefined} />
      <Chips label="Frequência" options={[{ value: 'daily', label: 'Diário' }, { value: 'weekly', label: 'Semanal' }, { value: 'monthly', label: 'Mensal' }]} value={frequency} onChange={setFrequency} />
      <Button label="Agendar" icon="send-outline" disabled={!formValid} loading={busy === 'new'} onPress={() => void run('new', async () => {
        must(await db.from('platform_report_schedules').insert({ name: name.trim(), recipients: parsed.recipients, frequency }));
        setRecipientsInput('');
        return { message: 'Relatório agendado.' };
      })} />
    </Card>
    {loading ? <StateView loading title="Carregando agendamentos…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar os agendamentos." message={error} onAction={reload} /> : !all.length ? <StateView icon="calendar-outline" title="Nenhum relatório agendado" message="Crie um agendamento para enviar resumos executivos automaticamente." /> :
      <Section title={`${visible.length} de ${all.length}`} action={filter !== 'todos' ? <Button variant="ghost" label="Limpar filtros" onPress={() => setFilter('todos')} /> : null}>
        {!visible.length ? <StateView icon="funnel-outline" title="Nenhum agendamento neste filtro." /> : visible.map(s => {
          const recent = runsOf(s.id).slice(0, 3);
          const next = new Date(s.next_run_at).getTime();
          const nextLabel = !s.active ? 'Pausado' : Number.isFinite(next) && next <= Date.now() ? 'Aguardando tentativa automática (verificação horária)' : when(s.next_run_at);
          return <Card key={s.id} style={[styles.card, lastFailed(s) && { borderColor: colors.danger }]}>
            <View style={styles.head}><Text style={styles.name}>{s.name}</Text><Badge label={s.active ? 'Ativo' : 'Pausado'} tone={s.active ? 'primary' : 'neutral'} /><Badge label={frequencyLabels[s.frequency] || s.frequency} tone="info" /></View>
            <Text style={styles.note}>{s.recipients.join(', ')}</Text>
            <Text style={styles.note}>Próxima execução: {nextLabel} · Última tentativa: {when(recent[0]?.created_at || s.last_run_at)}</Text>
            <View style={styles.actions}>
              <Button variant="secondary" icon={s.active ? 'pause' : 'play'} label={s.active ? 'Pausar' : 'Reativar'} loading={busy === `toggle-${s.id}`} disabled={!!busy} onPress={() => void run(`toggle-${s.id}`, async () => {
                const rows = must(await db.from('platform_report_schedules').update({ active: !s.active }).eq('id', s.id).select('id'));
                if (!rows?.length) throw new Error('Agendamento não encontrado ou sem permissão para alterar.');
                return { message: s.active ? 'Agendamento pausado.' : 'Agendamento reativado.' };
              })} />
              <Button icon="play" label="Executar agora" loading={busy === `run-${s.id}`} disabled={!s.active || !!busy} onPress={() => runNow(s)} />
            </View>
            <Text style={styles.sub}>Execuções recentes</Text>
            {!recent.length ? <Text style={styles.note}>Ainda não há execuções registradas.</Text> : recent.map(r => <View key={r.id} style={styles.run}>
              <Badge label={r.status === 'success' ? 'Enviado' : 'Falhou'} tone={r.status === 'success' ? 'success' : 'danger'} />
              <Text style={styles.note}>{when(r.created_at)} · {r.recipients_count} destinatário(s)</Text>
              {r.error ? <Text style={styles.err}>{r.error}</Text> : null}
            </View>)}
          </Card>;
        })}
      </Section>}
    {data?.runs.length === 200 ? <Text style={styles.note}>O histórico mostra as 200 execuções mais recentes da plataforma; execuções mais antigas podem não aparecer.</Text> : null}
  </ModuleScreen>;
}

const styles = StyleSheet.create({ stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }, form: { marginTop: 14 }, title: { color: colors.ink, fontSize: 15, fontWeight: '700', marginBottom: 6 }, note: { color: colors.muted, fontSize: 11, lineHeight: 16, marginBottom: 6 }, card: { marginBottom: 10 }, head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }, name: { color: colors.ink, fontSize: 14, fontWeight: '700' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }, sub: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 6, marginBottom: 6 }, run: { backgroundColor: colors.primarySoft, borderRadius: 10, padding: 8, marginBottom: 6, gap: 4 }, err: { color: colors.danger, fontSize: 11 } });
