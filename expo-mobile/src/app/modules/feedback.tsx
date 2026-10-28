import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen, OpenOnWeb } from '../../components/ModuleScreen';
import { Badge, Button, Card, Chips, Feedback as Notice, Field, Section, StateView } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Item = { id: string; protocolo: string; categoria: string; mensagem: string; contexto: Record<string, string> | null; status: string; resposta_publica: string | null; created_at: string };
const categories: Record<string, string> = { duvida: 'Dúvida', problema: 'Problema', sugestao: 'Sugestão', elogio: 'Elogio', acessibilidade: 'Acessibilidade' };
const statuses: Record<string, string> = { recebido: 'Recebido', em_analise: 'Em análise', planejado: 'Planejado', resolvido: 'Resolvido', encerrado: 'Encerrado' };
const empty = { categoria: 'sugestao', mensagem: '', tela: '', acao: '', erro: '' };

export default function FeedbackScreen() {
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const platform = Boolean(profile?.isPlatformAdmin);
  const [form, setForm] = useState(empty);
  const [showContext, setShowContext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const lock = useRef(false);

  // RLS returns only the user's own protocols for clinic users, as on the web.
  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!userId || platform) return undefined;
    const res = await client.from('product_feedback').select('id,protocolo,categoria,mensagem,contexto,status,resposta_publica,created_at', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(0, 99);
    return { items: must<Item[]>(res) ?? [], total: (res.count as number | null) ?? 0 };
  }, [userId, platform]);

  const valid = form.mensagem.trim().length >= 10 && form.mensagem.length <= 2000;

  async function submit() {
    if (lock.current || !valid) return;
    lock.current = true; setBusy(true); setNotice(null);
    try {
      const contexto = Object.fromEntries(Object.entries({ tela: form.tela, acao: form.acao, erro: form.erro }).filter(([, v]) => v.trim()));
      const rows = must<{ protocolo: string }[]>(await db.rpc('submit_product_feedback', { p_categoria: form.categoria, p_mensagem: form.mensagem, p_contexto: contexto }));
      setForm(empty); setShowContext(false);
      setNotice({ message: `Feedback enviado. Protocolo ${rows?.[0]?.protocolo ?? '—'}.` });
      reload();
    } catch (err) { setNotice({ message: `Não foi possível enviar. ${friendlyError(err)}`, error: true }); } finally { lock.current = false; setBusy(false); }
  }

  if (platform) return <ModuleScreen moduleKey="feedback" title="Feedback do produto" subtitle="A fila de feedbacks das clínicas é gerenciada na versão web."><OpenOnWeb path="/feedback" label="Abrir fila de feedbacks no navegador" /></ModuleScreen>;

  const items = data?.items ?? [];
  return <ModuleScreen moduleKey="feedback" title="Feedback do produto" subtitle={data?.total ? `${data.total} protocolo(s) · ${items.filter(i => i.status === 'recebido' || i.status === 'em_analise').length} aguardando retorno` : 'Conte o que podemos melhorar e acompanhe a resposta pelo protocolo.'} refreshing={refreshing} onRefresh={refresh}>
    <Card>
      <Text style={styles.title}>Enviar feedback</Text>
      <Text style={styles.hint}>Não inclua nomes de pacientes, CPF, prontuários, senhas ou tokens. Nenhum contexto técnico é coletado automaticamente.</Text>
      <Chips label="Categoria" options={Object.entries(categories).map(([value, label]) => ({ value, label }))} value={form.categoria} onChange={categoria => setForm({ ...form, categoria })} />
      <Field label="Mensagem" value={form.mensagem} onChangeText={mensagem => setForm({ ...form, mensagem })} multiline maxLength={2000} placeholder="Descreva sua ideia ou o que não funcionou (sem dados de pacientes)." hint={`${form.mensagem.length}/2000 caracteres · mínimo de 10`} />
      <Button variant="ghost" icon={showContext ? 'chevron-up' : 'chevron-down'} label="Adicionar contexto técnico (opcional)" onPress={() => setShowContext(!showContext)} />
      {showContext ? <View style={styles.context}>
        <Text style={styles.hint}>Preencha apenas informações operacionais. Nada é preenchido automaticamente.</Text>
        <Field label="Tela ou módulo" value={form.tela} onChangeText={tela => setForm({ ...form, tela })} maxLength={100} />
        <Field label="O que você tentou fazer?" value={form.acao} onChangeText={acao => setForm({ ...form, acao })} maxLength={300} />
        <Field label="Mensagem de erro (sem dados pessoais)" value={form.erro} onChangeText={erro => setForm({ ...form, erro })} multiline maxLength={500} />
      </View> : null}
      {notice ? <Notice message={notice.message} error={notice.error} /> : null}
      <Text style={styles.hint}>Até 3 envios a cada 15 minutos.</Text>
      <Button icon="send" label={busy ? 'Enviando…' : 'Enviar feedback'} loading={busy} disabled={!valid} onPress={() => void submit()} />
    </Card>
    <Section title="Meus protocolos">
      {loading ? <StateView loading title="Carregando protocolos…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar" message={error} onAction={reload} /> : !items.length ? <StateView icon="bulb-outline" title="Nenhum feedback por aqui" message="Use o formulário acima para enviar sua primeira sugestão ou relatar um problema." /> :
        items.map(i => <Card key={i.id} style={styles.item}>
          <View style={styles.head}><View style={styles.fill}><Text selectable style={styles.protocol}>{i.protocolo}</Text><Text style={styles.hint}>{dateLabel(i.created_at)} · {categories[i.categoria] ?? i.categoria}</Text></View><Badge label={statuses[i.status] ?? i.status} tone={i.status === 'resolvido' ? 'success' : 'primary'} /></View>
          <Text selectable style={styles.body}>{i.mensagem}</Text>
          {Object.keys(i.contexto ?? {}).length ? <View style={styles.context}><Text style={styles.label}>Contexto informado</Text>{Object.entries(i.contexto ?? {}).map(([k, v]) => <Text key={k} style={styles.hint}>{k}: {v}</Text>)}</View> : null}
          {i.resposta_publica ? <View style={styles.reply}><Text style={styles.label}>Resposta do EloLab</Text><Text selectable style={styles.body}>{i.resposta_publica}</Text></View> : null}
        </Card>)}
      {(data?.total ?? 0) > 100 ? <Text style={styles.hint}>Exibindo os 100 protocolos mais recentes.</Text> : null}
    </Section>
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 15, fontWeight: '800' }, hint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginVertical: 4 }, label: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  context: { backgroundColor: colors.surfaceMuted, borderRadius: 13, padding: 12, marginVertical: 6 }, item: { marginBottom: 10, gap: 6 }, head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, fill: { flex: 1 },
  protocol: { color: colors.ink, fontSize: 13, fontWeight: '800' }, body: { color: colors.ink, fontSize: 13, lineHeight: 19 }, reply: { borderLeftWidth: 4, borderLeftColor: colors.primary, backgroundColor: colors.primarySoft, borderRadius: 10, padding: 10 },
});
