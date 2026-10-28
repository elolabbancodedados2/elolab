import { router, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Feedback, Field, ListRow, Section, StateView } from '../../components/ui';
import { friendlyError } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type OpState = { somente_leitura: boolean; bloqueio_emergencial: boolean };
type Flag = { id: string; nome: string; chave: string; percentual: number | null; destino: string | null; ativo: boolean };
type Change = { field: keyof OpState; value: boolean; title: string; description: string };

export default function AdminOperationsScreen() {
  const { session } = useAuth();
  const lock = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [chave, setChave] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    const [state, flags] = await Promise.all([
      client.from('platform_operational_state').select('*').single(),
      client.from('platform_feature_flags').select('*').order('nome'),
    ]);
    return { state: must<OpState>(state), flags: (must(flags) ?? []) as Flag[] };
  }, []);
  const state = data?.state;

  async function run(key: string, action: () => Promise<void>, success: string) {
    if (lock.current) return;
    lock.current = true; setBusy(key); setFeedback(null);
    try { await action(); setFeedback({ message: success }); } catch (err) { setFeedback({ message: friendlyError(err), error: true }); } finally { lock.current = false; setBusy(null); reload(); }
  }

  function ask(change: Change) {
    Alert.alert(change.title, `${change.description} Confirme somente se essa mudança foi planejada.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar mudança', style: change.value ? 'destructive' : 'default', onPress: () => void run(change.field, async () => {
        // Same guard as the web: only flips when the stored value is still the opposite one.
        const row = must(await db.from('platform_operational_state').update({ [change.field]: change.value, updated_by: session?.user.id, updated_at: new Date().toISOString() }).eq('id', true).eq(change.field, !change.value).select('id').maybeSingle());
        if (!row) throw new Error('O estado mudou desde a confirmação. Confira o valor atual antes de tentar novamente.');
      }, change.value ? 'Modo operacional ativado.' : 'Modo operacional desativado.') },
    ]);
  }

  return <ModuleScreen moduleKey="admin-operacoes" title="Controle Operacional" subtitle={state ? `Somente leitura ${state.somente_leitura ? 'ativado' : 'desativado'} · bloqueio emergencial ${state.bloqueio_emergencial ? 'ativado' : 'desativado'}. Mudanças de impacto exigem confirmação e ficam registradas na auditoria.` : 'Controles globais da plataforma. Mudanças de impacto exigem confirmação e ficam registradas na auditoria.'} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <View style={styles.links}><Button variant="secondary" icon="alert-circle-outline" label="Incidentes" onPress={() => router.push('/modules/admin-incidentes' as Href)} /><Button variant="secondary" icon="pulse-outline" label="Saúde da plataforma" onPress={() => router.push('/modules/admin-saude' as Href)} /></View>
    {loading ? <StateView loading title="Consultando os controles globais…" /> : error || !state ? <StateView icon="alert-circle-outline" title="Não foi possível carregar o estado operacional" message={error ?? 'Os controles estão desativados.'} onAction={reload} /> : <>
      <Card style={[styles.card, state.somente_leitura && { borderColor: colors.warning, backgroundColor: colors.warningSoft }]}>
        <View style={styles.head}><Text style={styles.title}>Modo somente leitura</Text>{state.somente_leitura ? <Badge label="Ativo" tone="warning" /> : null}</View>
        <Text style={styles.note}>Suspende gravações clínicas e financeiras em todas as clínicas.</Text>
        <Button variant={state.somente_leitura ? 'secondary' : 'danger'} label={state.somente_leitura ? 'Desativar modo somente leitura' : 'Ativar modo somente leitura'} loading={busy === 'somente_leitura'} disabled={!!busy}
          onPress={() => ask(state.somente_leitura
            ? { field: 'somente_leitura', value: false, title: 'Desativar modo somente leitura?', description: 'As clínicas voltarão a poder gravar alterações clínicas e financeiras.' }
            : { field: 'somente_leitura', value: true, title: 'Ativar modo somente leitura?', description: 'Todas as clínicas deixarão de poder gravar alterações clínicas e financeiras até que esse modo seja desativado.' })} />
      </Card>
      <Card style={[styles.card, { borderColor: colors.danger }, state.bloqueio_emergencial && { backgroundColor: colors.dangerSoft }]}>
        <View style={styles.head}><Text style={styles.title}>Bloqueio emergencial</Text>{state.bloqueio_emergencial ? <Badge label="Ativo" tone="danger" /> : null}</View>
        <Text style={styles.note}>Bloqueia o acesso de todas as clínicas à plataforma.</Text>
        <Button variant={state.bloqueio_emergencial ? 'secondary' : 'danger'} label={state.bloqueio_emergencial ? 'Liberar todas as clínicas' : 'Bloquear todas as clínicas'} loading={busy === 'bloqueio_emergencial'} disabled={!!busy}
          onPress={() => ask(state.bloqueio_emergencial
            ? { field: 'bloqueio_emergencial', value: false, title: 'Liberar o acesso de todas as clínicas?', description: 'Os usuários das clínicas poderão voltar a acessar o EloLab.' }
            : { field: 'bloqueio_emergencial', value: true, title: 'Bloquear o acesso de todas as clínicas?', description: 'Todos os usuários das clínicas perderão acesso ao EloLab. Use somente durante um incidente que exija bloqueio global.' })} />
      </Card>
      <Section title="Nova feature flag">
        <Text style={styles.note}>As chaves aceitam letras minúsculas, números e sublinhado. O cadastro não altera o app até um módulo consumir essa chave.</Text>
        <Field label="Nome do recurso" value={nome} onChangeText={setNome} placeholder="Nome do recurso" />
        <Field label="Chave do recurso" value={chave} autoCapitalize="none" autoCorrect={false} onChangeText={v => setChave(v.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="chave_do_recurso" />
        <Button label="Cadastrar flag" icon="add" disabled={!nome.trim() || !chave.trim()} loading={busy === 'flag'} onPress={() => {
          if (!/^[a-z0-9_]+$/.test(chave.trim())) return setFeedback({ message: 'Informe um nome e uma chave válida usando letras minúsculas, números e _ .', error: true });
          void run('flag', async () => { must(await db.from('platform_feature_flags').insert({ nome: nome.trim(), chave: chave.trim(), updated_by: session?.user.id })); setNome(''); setChave(''); }, 'Flag cadastrada. Ela ainda precisa ser conectada ao módulo correspondente no código.');
        }} />
      </Section>
      <Section title={`Catálogo de feature flags (${data.flags.length})`}>
        <Text style={styles.note}>Estas chaves ainda não são consumidas por telas ou permissões do app. O estado é apenas informativo e não libera nem oculta funcionalidades.</Text>
        {!data.flags.length ? <StateView icon="flag-outline" title="Nenhum recurso controlado ainda." message="Cadastre a primeira chave no formulário acima." /> : data.flags.map(f =>
          <ListRow key={f.id} title={f.nome} subtitle={`${f.chave} · ${f.percentual ?? 0}% · ${f.destino ?? '—'}`} meta="Sem consumidor no app" right={<Badge label={f.ativo ? 'Ativa no cadastro' : 'Inativa no cadastro'} tone={f.ativo ? 'primary' : 'neutral'} />} />)}
      </Section>
    </>}
  </ModuleScreen>;
}

const styles = StyleSheet.create({ links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }, card: { marginTop: 14, gap: 8 }, head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, title: { color: colors.ink, fontSize: 15, fontWeight: '700' }, note: { color: colors.muted, fontSize: 11, lineHeight: 16, marginBottom: 8 } });
