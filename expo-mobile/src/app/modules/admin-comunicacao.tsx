import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, Section, Stat, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError, parseDateBR } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Destination = 'todos' | 'clinica' | 'plano';
type Kind = 'info' | 'sucesso' | 'atencao' | 'critico';
type Announcement = { id: string; titulo: string; mensagem: string; tipo: Kind; destino: Destination; destino_id: string | null; inicia_em: string; termina_em: string | null; publicado: boolean; created_at: string };
type Status = 'Publicado' | 'Programado' | 'Encerrado';

const typeLabels: Record<Kind, string> = { info: 'Informação', sucesso: 'Sucesso', atencao: 'Atenção', critico: 'Crítico' };
const typeTone: Record<Kind, Tone> = { info: 'info', sucesso: 'success', atencao: 'warning', critico: 'danger' };
const destinationLabels: Record<Destination, string> = { todos: 'Todas as clínicas', clinica: 'Uma clínica', plano: 'Um plano' };
const pad = (n: number) => String(n).padStart(2, '0');
const nowLabel = () => { const d = new Date(); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** "DD/MM/AAAA HH:mm" in device local time (the web uses the browser's datetime-local) → Date, or null. */
function parseDateTime(value: string) {
  const [date, time = ''] = value.trim().split(/\s+/);
  const iso = parseDateBR(date ?? '');
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!iso || !t) return null;
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d, Number(t[1]), Number(t[2]));
}
function statusOf(item: Announcement, now: number) {
  const isScheduled = item.publicado && new Date(item.inicia_em).getTime() > now;
  const isActive = item.publicado && !isScheduled && (!item.termina_em || new Date(item.termina_em).getTime() > now);
  const status: Status = !item.publicado || (!isActive && !isScheduled) ? 'Encerrado' : isScheduled ? 'Programado' : 'Publicado';
  return { isActive, status };
}

export default function AdminAnnouncementsScreen() {
  const { session } = useAuth();
  const [form, setForm] = useState({ titulo: '', mensagem: '', tipo: 'info' as Kind, destino: 'todos' as Destination, destino_id: '', inicia_em: nowLabel(), termina_em: '' });
  const [targetSearch, setTargetSearch] = useState('');
  const [filter, setFilter] = useState<Status | 'todos'>('todos');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const lock = useRef(false);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    const [clinics, plans, items] = await Promise.all([
      client.from('clinicas').select('id,nome').eq('arquivada', false).order('nome'),
      client.from('planos').select('id,nome,slug').eq('ativo', true).order('ordem'),
      client.from('platform_announcements').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    return { clinics: (must(clinics) ?? []) as { id: string; nome: string }[], plans: (must(plans) ?? []) as { id: string; nome: string; slug: string }[], items: (must(items) ?? []) as Announcement[] };
  }, []);

  const now = Date.now();
  const history = data?.items ?? [];
  const counts = { Publicado: 0, Programado: 0, Encerrado: 0 } as Record<Status, number>;
  history.forEach(item => { counts[statusOf(item, now).status] += 1; });
  const visible = filter === 'todos' ? history : history.filter(item => statusOf(item, now).status === filter);
  const destinationName = (item: Announcement) => item.destino === 'todos' ? destinationLabels.todos : item.destino === 'clinica'
    ? data?.clinics.find(c => c.id === item.destino_id)?.nome || `Clínica (${item.destino_id || 'sem identificação'})`
    : data?.plans.find(p => p.slug === item.destino_id)?.nome || `Plano (${item.destino_id || 'sem identificação'})`;
  const term = targetSearch.trim().toLocaleLowerCase('pt-BR');
  // Web stores clinic id for "clinica" and plan slug for "plano".
  const targetOptions = form.destino === 'clinica'
    ? (data?.clinics ?? []).filter(c => c.id === form.destino_id || (term && c.nome.toLocaleLowerCase('pt-BR').includes(term))).slice(0, 8).map(c => ({ value: c.id, label: c.nome }))
    : (data?.plans ?? []).map(p => ({ value: p.slug, label: p.nome }));

  async function publish() {
    const start = parseDateTime(form.inicia_em);
    const end = form.termina_em.trim() ? parseDateTime(form.termina_em) : null;
    const fail = (message: string) => setFeedback({ message, error: true });
    if (form.titulo.trim().length < 3) return fail('Informe um título com pelo menos 3 caracteres.');
    if (form.mensagem.trim().length < 5) return fail('Informe uma mensagem com pelo menos 5 caracteres.');
    if (form.destino !== 'todos' && !form.destino_id) return fail(form.destino === 'clinica' ? 'Selecione a clínica.' : 'Selecione o plano.');
    if (!start || (form.termina_em.trim() && !end)) return fail('Use data e hora no formato DD/MM/AAAA HH:mm.');
    if (end && end.getTime() <= start.getTime()) return fail('A data final deve ser posterior ao início.');
    if (end && end.getTime() <= Date.now()) return fail('A data final precisa estar no futuro para o comunicado não nascer encerrado.');
    if (lock.current) return;
    lock.current = true; setBusy('publish'); setFeedback(null);
    try {
      must(await db.from('platform_announcements').insert({ titulo: form.titulo.trim(), mensagem: form.mensagem.trim(), tipo: form.tipo, destino: form.destino, destino_id: form.destino === 'todos' ? null : form.destino_id, inicia_em: start.toISOString(), termina_em: end ? end.toISOString() : null, publicado: true, criado_por: session?.user.id }));
      setForm(current => ({ ...current, titulo: '', mensagem: '' }));
      setFeedback({ message: 'Comunicado publicado.' });
      reload();
    } catch (err) { fail(`Não foi possível publicar o comunicado. ${friendlyError(err)}`); } finally { lock.current = false; setBusy(null); }
  }

  const end = (item: Announcement) => Alert.alert('Encerrar comunicado?', `“${item.titulo}” deixará de aparecer imediatamente para as clínicas destinatárias. O registro será mantido no histórico.`, [
    { text: 'Manter publicado', style: 'cancel' },
    { text: 'Encerrar agora', style: 'destructive', onPress: () => void (async () => {
      setBusy(item.id); setFeedback(null);
      try {
        must(await db.from('platform_announcements').update({ publicado: false }).eq('id', item.id).eq('publicado', true).select('id').maybeSingle());
        // Same check as the web: confirm the row is now unpublished, otherwise it changed meanwhile.
        const row = must(await db.from('platform_announcements').select('id').eq('id', item.id).eq('publicado', false).maybeSingle());
        if (!row) throw new Error('O comunicado mudou antes do encerramento. Atualize o histórico e tente novamente.');
        setFeedback({ message: 'Comunicado encerrado.' });
        reload();
      } catch (err) { setFeedback({ message: `Não foi possível encerrar o comunicado. ${friendlyError(err)}`, error: true }); } finally { setBusy(null); }
    })() },
  ]);

  return <ModuleScreen moduleKey="admin-comunicacao" subtitle={history.length ? `${counts.Publicado} visíveis agora · ${counts.Programado} programados · ${counts.Encerrado} encerrados` : 'Envie avisos para todas as clínicas, uma clínica específica ou clientes de um plano.'} refreshing={refreshing} onRefresh={refresh}>
    {history.length ? <View style={styles.stats}>
      <Stat label="Comunicados · no histórico recente" value={history.length} onPress={() => setFilter('todos')} />
      <Stat label="Visíveis agora" value={counts.Publicado} tone="success" onPress={() => setFilter('Publicado')} />
      <Stat label="Programados" value={counts.Programado} tone="info" onPress={() => setFilter('Programado')} />
      <Stat label="Encerrados" value={counts.Encerrado} tone="neutral" onPress={() => setFilter('Encerrado')} />
    </View> : null}
    <Section title="Novo comunicado">
      <Card>
        <Text style={styles.copy}>Defina o público e o período de exibição. Comunicados críticos devem informar impacto e orientação com clareza.</Text>
        <Field label="Título" value={form.titulo} maxLength={160} onChangeText={titulo => setForm({ ...form, titulo })} placeholder="Ex.: Instabilidade no envio de notificações" />
        <Chips label="Tipo" options={(Object.keys(typeLabels) as Kind[]).map(value => ({ value, label: typeLabels[value] }))} value={form.tipo} onChange={tipo => setForm({ ...form, tipo })} />
        <Field label="Mensagem" value={form.mensagem} maxLength={5000} multiline onChangeText={mensagem => setForm({ ...form, mensagem })} placeholder="Explique o que aconteceu, quem é afetado e quais ações são necessárias." />
        <Chips label="Público" options={(Object.keys(destinationLabels) as Destination[]).map(value => ({ value, label: destinationLabels[value] }))} value={form.destino} onChange={destino => { setForm({ ...form, destino, destino_id: '' }); setTargetSearch(''); }} />
        {form.destino === 'clinica' ? <Field label="Clínica" value={targetSearch} onChangeText={setTargetSearch} placeholder="Digite para buscar a clínica" /> : null}
        {form.destino !== 'todos' ? targetOptions.length ? <Chips label={form.destino === 'plano' ? 'Plano' : undefined} options={targetOptions} value={form.destino_id || null} onChange={destino_id => setForm({ ...form, destino_id })} />
          : form.destino === 'plano' || term ? <Text style={styles.copy}>Nenhuma opção ativa encontrada.</Text> : null : null}
        <Field label="Exibir a partir de" value={form.inicia_em} onChangeText={inicia_em => setForm({ ...form, inicia_em })} placeholder="DD/MM/AAAA HH:mm" keyboardType="numbers-and-punctuation" />
        <Field label="Ocultar em" value={form.termina_em} onChangeText={termina_em => setForm({ ...form, termina_em })} placeholder="DD/MM/AAAA HH:mm" keyboardType="numbers-and-punctuation" hint="Opcional" />
        <Button label="Publicar comunicado" icon="send" loading={busy === 'publish'} disabled={loading || !!error} onPress={() => void publish()} />
      </Card>
    </Section>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <Section title="Histórico de comunicados" action={filter !== 'todos' ? <Button variant="ghost" label="Limpar filtros" onPress={() => setFilter('todos')} /> : null}>
      <Text style={styles.copy}>Até os 100 comunicados mais recentes.{history.length ? ` ${visible.length} de ${history.length}.` : ''}</Text>
      {loading ? <StateView loading title="Carregando comunicados…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar o histórico." message={error} onAction={reload} /> :
        !history.length ? <StateView icon="megaphone-outline" title="Nenhum comunicado ainda" message="Os avisos publicados aparecerão nesta lista. Use o formulário acima para enviar o primeiro." /> :
          !visible.length ? <StateView title="Nenhum comunicado com este status." /> : visible.map(item => {
            const { isActive, status } = statusOf(item, now);
            return <Card key={item.id} style={[styles.item, isActive && styles.active]}>
              <View style={styles.badges}><Badge label={typeLabels[item.tipo] ?? item.tipo} tone={typeTone[item.tipo]} /><Badge label={status} tone={status === 'Publicado' ? 'primary' : status === 'Programado' ? 'info' : 'neutral'} /></View>
              <Text style={styles.title}>{item.titulo}</Text>
              <Text style={styles.body}>{item.mensagem}</Text>
              <Text style={styles.copy}>Público: {destinationName(item)} · Exibição: {dateLabel(item.inicia_em)}{item.termina_em ? ` até ${dateLabel(item.termina_em)}` : ' · sem data final'}{isActive ? ` · ${item.termina_em ? 'Visível para o público agora' : 'Visível sem data final'}` : ''}</Text>
              {isActive ? <Button variant="danger" icon="close-circle-outline" label="Encerrar comunicado" loading={busy === item.id} disabled={!!busy} onPress={() => end(item)} /> : null}
            </Card>;
          })}
    </Section>
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, copy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginBottom: 10 },
  item: { marginBottom: 10 }, active: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }, badges: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  title: { color: colors.ink, fontSize: 14, fontWeight: '700', marginBottom: 4 }, body: { color: colors.ink, fontSize: 12, lineHeight: 18, marginBottom: 8 },
});
