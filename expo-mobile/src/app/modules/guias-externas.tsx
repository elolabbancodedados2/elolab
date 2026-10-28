import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback, Field, ListRow, Section, StateView, Stat, type Tone } from '../../components/ui';
import { clinicDate, dateLabel, friendlyError, parseDateBR } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Guia = { id: string; status: string; origem: string | null; data_recebimento: string | null; paciente_id: string | null; paciente_nome: string; paciente_cpf: string | null; paciente_nascimento: string | null; paciente_telefone: string | null; paciente_email: string | null; paciente_sexo: string | null; medico_externo_nome: string | null; medico_externo_crm: string | null; medico_externo_uf: string | null; convenio_nome: string | null; numero_autorizacao: string | null; validade_autorizacao: string | null; exames_solicitados: { nome?: string; tipo?: string; descricao?: string }[] | null; observacoes: string | null; anexo_url: string | null; anexo_nome: string | null };
type Filter = 'todos' | 'recebida' | 'em_analise' | 'agendada' | 'encaminhada_fila' | 'finalizada' | 'cancelada';

const PAGE = 1000; // shortcut: one page instead of the web's 20.000-row block fetch; the copy flags when the cap is hit.
const statusInfo: Record<string, { label: string; tone: Tone }> = { recebida: { label: 'Recebida', tone: 'warning' }, em_analise: { label: 'Em análise', tone: 'primary' }, agendada: { label: 'Agendada', tone: 'info' }, encaminhada_fila: { label: 'Na fila', tone: 'primary' }, finalizada: { label: 'Finalizada', tone: 'success' }, cancelada: { label: 'Cancelada', tone: 'neutral' } };
const originLabel: Record<string, string> = { manual: 'Manual', portal: 'Portal externo', email: 'E-mail', api: 'API' };
const filters: { value: Filter; label: string }[] = [{ value: 'todos', label: 'Todos' }, { value: 'recebida', label: 'Aguardando' }, { value: 'em_analise', label: 'Em análise' }, { value: 'agendada', label: 'Agendadas' }, { value: 'encaminhada_fila', label: 'Na fila' }, { value: 'finalizada', label: 'Finalizadas' }, { value: 'cancelada', label: 'Canceladas' }];

function whatsApp(phone: string | null, message: string) {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`}?text=${encodeURIComponent(message)}`;
}

/** Same rule as the web: reuse the patient by CPF in the clinic, otherwise create it (race-safe on unique CPF). */
async function patientForGuia(guia: Guia, clinicId: string): Promise<string> {
  if (guia.paciente_id) return guia.paciente_id;
  const original = String(guia.paciente_cpf || '').trim();
  const digits = original.replace(/\D/g, '');
  const variants = new Set<string>(original ? [original] : []);
  if (digits.length === 11) { variants.add(digits); variants.add(`${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`); }
  const byCpf = async () => digits.length === 11 ? (must<{ id: string } | null>(await db.from('pacientes').select('id').eq('clinica_id', clinicId).in('cpf', [...variants]).maybeSingle()))?.id ?? null : null;
  const existing = await byCpf();
  if (existing) return existing;
  const { data, error } = await db.from('pacientes').insert({ nome: guia.paciente_nome, cpf: original || null, data_nascimento: guia.paciente_nascimento || null, telefone: guia.paciente_telefone || null, email: guia.paciente_email || null, sexo: guia.paciente_sexo || null, clinica_id: clinicId }).select('id').single();
  if (!error && data?.id) return data.id;
  if (error?.code === '23505' && digits.length === 11) { const raced = await byCpf(); if (raced) return raced; }
  if (error) throw error;
  throw new Error('Não foi possível vincular ou criar o cadastro do paciente.');
}

export default function GuiasExternasScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [filter, setFilter] = useState<Filter>('todos');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<{ data: string; hora: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    return must<Guia[]>(await client.from('guias_externas').select('*').eq('clinica_id', clinicId).order('data_recebimento', { ascending: false }).order('id', { ascending: true }).range(0, PAGE - 1)) ?? [];
  }, [clinicId]);

  const guias = data ?? [];
  const count = (s: string) => guias.filter(g => g.status === s).length;
  const q = search.trim().toLowerCase();
  const visible = guias.filter(g => (filter === 'todos' || g.status === filter) && (!q || [g.paciente_nome, g.medico_externo_nome, g.convenio_nome, g.numero_autorizacao].some(v => v?.toLowerCase().includes(q))));
  const guia = guias.find(g => g.id === selected);

  async function run(key: string, action: () => Promise<string>, close = true) {
    if (!clinicId) return;
    setBusy(key); setFeedback(null);
    try { const message = await action(); setFeedback({ message }); if (close) { setSelected(null); setSchedule(null); } } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { setBusy(null); reload(); }
  }

  function cancel(g: Guia) {
    Alert.alert('Cancelar guia', `Cancelar a guia de ${g.paciente_nome}?`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Cancelar guia', style: 'destructive', onPress: () => void run('cancelar', async () => {
        // Guarded by the status the user saw, same as the web.
        const row = must(await db.from('guias_externas').update({ status: 'cancelada' }).eq('id', g.id).eq('clinica_id', clinicId).eq('status', g.status).select('id').maybeSingle());
        if (!row) throw new Error('A guia mudou de estado ou não pertence à clínica atual. Atualize a lista.');
        return 'Guia cancelada.';
      }) },
    ]);
  }

  const toQueue = (g: Guia) => run('fila', async () => {
    if (!['recebida', 'em_analise', 'agendada'].includes(g.status)) throw new Error('Esta guia já foi encaminhada ou não aceita envio para a fila. Atualize a lista.');
    const pacienteId = await patientForGuia(g, clinicId!);
    must(await db.rpc('encaminhar_guia_externa_para_fila', { p_guia_id: g.id, p_clinica_id: clinicId, p_paciente_id: pacienteId }));
    return 'Guia enviada para a fila de coleta';
  });

  const book = (g: Guia) => run('agendar', async () => {
    if (!['recebida', 'em_analise'].includes(g.status)) throw new Error('Esta guia já foi agendada ou encaminhada. Atualize a lista.');
    const day = parseDateBR(schedule?.data ?? '');
    const hour = schedule?.hora.trim() ?? '';
    if (!day || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hour)) throw new Error('Informe uma data (DD/MM/AAAA) e hora (HH:MM) válidas.');
    if (day < clinicDate()) throw new Error('A data da coleta não pode estar no passado.');
    const pacienteId = await patientForGuia(g, clinicId!);
    must(await db.rpc('agendar_guia_externa', { p_guia_id: g.id, p_clinica_id: clinicId, p_paciente_id: pacienteId, p_data: day, p_hora: hour }));
    return 'Coleta agendada';
  });

  async function openAttachment(g: Guia) {
    try {
      const { data: signed, error: err } = await db.storage.from('guias-externas').createSignedUrl(g.anexo_url, 300);
      if (err) throw err;
      // Only open https URLs on our own Supabase host, like storageUrlSeguro on the web.
      const url = new URL(signed?.signedUrl ?? '');
      if (url.protocol !== 'https:' || url.hostname !== new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').hostname) throw new Error('O arquivo retornou um endereço não confiável');
      await Linking.openURL(url.href);
    } catch (err) { setFeedback({ message: `Não foi possível abrir o anexo. ${friendlyError(err)}`, error: true }); }
  }

  if (guia) {
    const open = !['cancelada', 'finalizada', 'encaminhada_fila'].includes(guia.status);
    const wa = whatsApp(guia.paciente_telefone, `Olá, ${guia.paciente_nome}! Entramos em contato sobre sua guia de exames.`);
    const info: [string, string | null][] = [['CPF', guia.paciente_cpf], ['Nascimento', guia.paciente_nascimento ? dateLabel(guia.paciente_nascimento) : null], ['Telefone', guia.paciente_telefone], ['Convênio', guia.convenio_nome], ['Médico solicitante', guia.medico_externo_nome], ['CRM', guia.medico_externo_crm ? `${guia.medico_externo_crm}/${guia.medico_externo_uf || ''}` : null], ['Nº autorização', guia.numero_autorizacao], ['Validade autorização', guia.validade_autorizacao ? dateLabel(guia.validade_autorizacao) : null]];
    return <ModuleScreen moduleKey="guias-externas" title={`Guia — ${guia.paciente_nome}`} subtitle={`Recebida em ${dateLabel(guia.data_recebimento)} · ${originLabel[guia.origem ?? ''] ?? guia.origem ?? '—'}`}
      action={<Button variant="ghost" icon="list-outline" label="Lista" onPress={() => { setSelected(null); setSchedule(null); setFeedback(null); }} />}>
      {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
      <Badge label={statusInfo[guia.status]?.label ?? guia.status} tone={statusInfo[guia.status]?.tone} />
      <Card style={styles.card}>{info.map(([label, value]) => <Text key={label} style={styles.info}><Text style={styles.bold}>{label}: </Text>{value || '—'}</Text>)}</Card>
      <Section title="Exames solicitados">{(guia.exames_solicitados ?? []).length ? (guia.exames_solicitados ?? []).map((ex, i) => <ListRow key={i} icon="flask-outline" title={ex.nome || ex.tipo || '—'} subtitle={ex.descricao} />) : <Text style={styles.info}>Nenhum exame informado.</Text>}</Section>
      {guia.observacoes ? <Card style={styles.card}><Text style={styles.info}><Text style={styles.bold}>Observações: </Text>{guia.observacoes}</Text></Card> : null}
      <View style={styles.actions}>
        {guia.anexo_url ? <Button variant="secondary" icon="document-attach-outline" label={`Abrir anexo${guia.anexo_nome ? `: ${guia.anexo_nome}` : ''}`} onPress={() => void openAttachment(guia)} /> : null}
        {wa ? <Button variant="secondary" icon="logo-whatsapp" label="WhatsApp" onPress={() => void Linking.openURL(wa)} /> : null}
      </View>
      {schedule ? <Card style={styles.card}>
        <Field label="Data" value={schedule.data} onChangeText={data => setSchedule({ ...schedule, data })} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" />
        <Field label="Hora" value={schedule.hora} onChangeText={hora => setSchedule({ ...schedule, hora })} placeholder="HH:MM" keyboardType="numbers-and-punctuation" />
        <View style={styles.actions}><Button variant="ghost" label="Cancelar" disabled={!!busy} onPress={() => setSchedule(null)} /><Button label="Confirmar agendamento" loading={busy === 'agendar'} disabled={!!busy} onPress={() => void book(guia)} /></View>
      </Card> : null}
      {open ? <View style={styles.actions}>
        <Button icon="arrow-forward" label="Enviar para fila de coleta" loading={busy === 'fila'} disabled={!!busy} onPress={() => void toQueue(guia)} />
        {!schedule && ['recebida', 'em_analise'].includes(guia.status) ? <Button variant="secondary" icon="calendar-outline" label="Agendar coleta" disabled={!!busy} onPress={() => setSchedule({ data: '', hora: '' })} /> : null}
        <Button variant="danger" icon="close" label="Cancelar guia" loading={busy === 'cancelar'} disabled={!!busy} onPress={() => cancel(guia)} />
      </View> : null}
      <Card style={styles.card}>
        <Text style={styles.info}>O acompanhamento do laboratório parceiro (prazo, custo e anexo do laudo em PDF) fica no navegador, porque exige envio de arquivo.</Text>
        <OpenOnWeb path="/guias-externas" />
      </Card>
    </ModuleScreen>;
  }

  return <ModuleScreen moduleKey="guias-externas" subtitle={guias.length ? `${guias.length} guia(s) · ${count('recebida') + count('em_analise')} aguardando · ${count('encaminhada_fila')} na fila` : 'Receba pedidos de exames vindos de médicos e clínicas externas'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <View style={styles.stats}>
      <Stat label="Aguardando" value={count('recebida')} tone="warning" onPress={() => setFilter('recebida')} />
      <Stat label="Em análise" value={count('em_analise')} onPress={() => setFilter('em_analise')} />
      <Stat label="Agendadas" value={count('agendada')} tone="info" onPress={() => setFilter('agendada')} />
      <Stat label="Na fila" value={count('encaminhada_fila')} tone="success" onPress={() => setFilter('encaminhada_fila')} />
    </View>
    <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Paciente, médico, convênio..." />
    <Chips label="Status" options={filters} value={filter} onChange={setFilter} />
    {loading ? <StateView loading title="Carregando guias…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar as guias externas" message={error} onAction={reload} /> : !visible.length ? <StateView icon="document-text-outline" title={q || filter !== 'todos' ? 'Nenhuma guia corresponde aos filtros' : 'Nenhuma guia externa registrada'} message={q || filter !== 'todos' ? 'Altere ou limpe a busca e o status selecionado.' : 'Novas guias são cadastradas no navegador.'} /> :
      <Section title={`${visible.length} de ${guias.length} guia(s)`}>{visible.map(g => <ListRow key={g.id} icon="document-text-outline" title={g.paciente_nome} subtitle={[g.medico_externo_nome, g.convenio_nome, g.numero_autorizacao ? `#${g.numero_autorizacao}` : null].filter(Boolean).join(' · ') || null}
        meta={`${(g.exames_solicitados ?? []).length} exame(s) · ${originLabel[g.origem ?? ''] ?? g.origem ?? '—'} · ${dateLabel(g.data_recebimento)}`} onPress={() => { setSelected(g.id); setFeedback(null); }}
        right={<Badge label={statusInfo[g.status]?.label ?? g.status} tone={statusInfo[g.status]?.tone} />} />)}</Section>}
    {guias.length >= PAGE ? <Text style={styles.note}>A lista mostra as {PAGE} guias mais recentes. Guias mais antigas estão no navegador.</Text> : null}
    <Card style={styles.card}>
      <Text style={styles.info}>Nova guia com anexo, links do portal externo e acompanhamento do laboratório parceiro ficam no navegador, porque envolvem envio de arquivo e cópia de links.</Text>
      <OpenOnWeb path="/guias-externas" />
    </Card>
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  card: { marginTop: 14, gap: 4 }, info: { color: colors.ink, fontSize: 12, lineHeight: 18 }, bold: { fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  note: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 12 },
});
