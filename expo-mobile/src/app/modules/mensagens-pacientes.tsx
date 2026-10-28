import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Chips, Feedback, Field, ListRow, Section, StateView, type Tone } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

// Native copy of the "fila" tab of src/pages/Automacoes.tsx (table notification_queue).
type Item = { id: string; tipo: string; destinatario_nome: string | null; status: string; tentativas: number; max_tentativas: number; erro_mensagem: string | null; agendado_para: string; created_at: string };
const statuses = [['pendente', 'Pendentes'], ['enviando', 'Enviando'], ['incerto', 'Resultado incerto'], ['erro', 'Com erro'], ['enviado', 'Enviados'], ['cancelado', 'Cancelados']] as const;
const statusTone: Record<string, Tone> = { erro: 'danger', incerto: 'warning', enviado: 'success', cancelado: 'neutral', pendente: 'primary', enviando: 'info' };

/** Copy of src/lib/notificationQueueErrorSummary.ts: maps provider errors to safe categories, never the raw text. */
function errorSummary(raw: string | null) {
  const e = raw?.trim().toLocaleLowerCase('pt-BR') ?? '';
  if (/limite mensal/.test(e)) return 'O limite mensal de envios da clínica foi atingido.';
  if (/limite de envios por minuto da clínica/.test(e)) return 'O limite de envios por minuto da clínica foi atingido; a fila tentará novamente.';
  if (/intervalo mínimo para este número/.test(e)) return 'O intervalo mínimo entre mensagens para este destinatário ainda não passou; a fila tentará novamente.';
  if (/^(brevo_api_key não configurada|evolution_api_url\/key não configurados)$/.test(e)) return 'A integração do canal está incompleta. Revise as configurações da clínica.';
  if (/nenhuma sessão whatsapp conectada/.test(e)) return 'Nenhuma sessão do WhatsApp está conectada.';
  if (/resultado do provedor incerto|aceitou o envio.*status local|confira o provedor/.test(e)) return 'O resultado do provedor é incerto. Confira antes de repetir o envio.';
  if (/brevo\s+http\s+429/.test(e)) return 'O provedor de e-mail limitou os envios. Tente novamente mais tarde.';
  if (/evolution(?:\s+http)?\s+429/.test(e)) return 'O provedor de WhatsApp limitou os envios. Tente novamente mais tarde.';
  if (/brevo\s+http\s+\d{3}/.test(e)) return 'O provedor de e-mail recusou ou não confirmou o envio. Consulte o suporte.';
  if (/evolution(?:\s+http)?\s+\d{3}/.test(e)) return 'O provedor de WhatsApp recusou o envio. Revise o canal e o destinatário.';
  if (/sem destinatário válido|canal .* não suportado/.test(e)) return 'O canal ou destinatário não está válido para este envio.';
  return 'Falha no processamento do envio. Consulte o suporte da clínica.';
}

export default function PatientMessagesScreen() {
  const { profile } = useAuth();
  const clinicId = profile?.clinicaId;
  const [status, setStatus] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!clinicId) return undefined;
    const [queue, claims] = await Promise.all([
      client.from('notification_queue').select('id, tipo, destinatario_nome, status, tentativas, max_tentativas, erro_mensagem, agendado_para, created_at').eq('clinica_id', clinicId).order('created_at', { ascending: false }).limit(100),
      client.from('automation_delivery_claims').select('estado, criado_em').eq('clinica_id', clinicId).in('estado', ['claimed', 'uncertain']).limit(50),
    ]);
    const review = ((must(claims) ?? []) as { estado: string; criado_em: string }[]).filter(c => c.estado === 'uncertain' || Date.now() - new Date(c.criado_em).getTime() >= 10 * 60_000).length;
    return { queue: (must(queue) ?? []) as Item[], review };
  }, [clinicId]);

  const queue = data?.queue ?? [];
  const term = search.trim().toLowerCase();
  const filtered = queue.filter(i => (status === 'todos' || i.status === status) && (!term || (i.destinatario_nome ?? '').toLowerCase().includes(term)));
  const pending = queue.filter(i => ['pendente', 'erro', 'incerto'].includes(i.status)).length;

  function act(item: Item, action: 'retry' | 'cancel') {
    const name = item.destinatario_nome || 'destinatário';
    Alert.alert(action === 'retry' ? 'Repetir envio' : 'Cancelar envio', action === 'retry' ? `Devolver à fila o envio para ${name}?` : `Cancelar o envio para ${name}?`, [
      { text: 'Voltar', style: 'cancel' },
      { text: action === 'retry' ? 'Repetir' : 'Cancelar envio', style: action === 'cancel' ? 'destructive' : 'default', onPress: () => void (async () => {
        if (!clinicId) return;
        setBusy(item.id);
        setFeedback(null);
        const changes = action === 'retry'
          ? { status: 'pendente', tentativas: 0, erro_mensagem: null, agendado_para: new Date().toISOString(), iniciado_em: null }
          : { status: 'cancelado', iniciado_em: null };
        try {
          // Conditional on the status shown, same as the web.
          const row = must(await db.from('notification_queue').update(changes).eq('id', item.id).eq('clinica_id', clinicId).eq('status', item.status).select('id').maybeSingle());
          if (!row) throw new Error('O envio mudou de estado ou não está disponível nesta clínica. Atualize a fila.');
          setFeedback({ message: action === 'retry' ? 'Envio devolvido à fila.' : 'Envio cancelado.' });
        } catch (err) { setFeedback({ message: friendlyError(err, 'Não foi possível atualizar o envio.'), error: true }); } finally { setBusy(null); reload(); }
      })() },
    ]);
  }

  return <ModuleScreen moduleKey="mensagens-pacientes" subtitle={data ? `${pending} mensagem(ns) na fila de envio.` : 'Lembretes e mensagens enviados aos pacientes.'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    {loading ? <StateView loading title="Carregando fila de envios…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar a fila" message={error} onAction={reload} /> : <>
      {data?.review ? <View style={styles.warn} accessibilityRole="alert"><Text style={styles.warnTitle}>{data.review} reserva(s) sem confirmação de envio</Text><Text style={styles.warnText}>Confira os registros do provedor antes de repetir: o envio pode ter sido aceito antes de a função parar.</Text></View> : null}
      <Chips label="Status" options={[{ value: 'todos', label: `Todos (${queue.length})` }, ...statuses.map(([value, label]) => ({ value, label: `${label} (${queue.filter(i => i.status === value).length})` }))]} value={status} onChange={setStatus} />
      <Field label="Buscar" value={search} onChangeText={setSearch} placeholder="Buscar por destinatário…" />
      {!filtered.length ? <StateView icon="list-outline" title={status !== 'todos' || term ? 'Nenhum envio corresponde à busca ou ao filtro selecionado' : 'Nenhum envio na fila'} actionLabel="Limpar filtros" onAction={status !== 'todos' || term ? () => { setStatus('todos'); setSearch(''); } : undefined} /> :
        <Section title={status !== 'todos' || term ? `${filtered.length} de ${queue.length} mensagens` : 'Últimos envios'}>{filtered.map(item => <View key={item.id}>
          <ListRow title={item.destinatario_nome || 'Destinatário'} subtitle={item.erro_mensagem ? errorSummary(item.erro_mensagem) : null} meta={`${dateLabel(item.agendado_para)} · ${item.tipo} · ${item.tentativas}/${item.max_tentativas} tentativas`}
            right={<Badge label={item.status === 'incerto' ? 'incerto · verificar' : item.status} tone={statusTone[item.status] ?? 'neutral'} />} />
          {['erro', 'cancelado', 'pendente'].includes(item.status) ? <View style={styles.actions}>
            {item.status === 'erro' || item.status === 'cancelado' ? <Button variant="secondary" icon="refresh" label="Repetir" disabled={busy === item.id} onPress={() => act(item, 'retry')} /> : null}
            {item.status === 'pendente' || item.status === 'erro' ? <Button variant="ghost" icon="close-circle-outline" label="Cancelar" disabled={busy === item.id} onPress={() => act(item, 'cancel')} /> : null}
          </View> : null}
        </View>)}</Section>}
    </>}
    <Text style={styles.note}>Mostra as 100 mensagens mais recentes. A revisão das reservas fica na versão web.</Text>
    <OpenOnWeb path="/automacoes?tab=fila" />
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  warn: { backgroundColor: colors.warningSoft, borderRadius: 13, padding: 12, marginBottom: 14 }, warnTitle: { color: colors.warning, fontSize: 13, fontWeight: '700' }, warnText: { color: colors.warning, fontSize: 11, lineHeight: 16, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 }, note: { color: colors.muted, fontSize: 11, textAlign: 'center', marginVertical: 14 },
});
