import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Button, Card, Chips, Feedback, ListRow, Section, StateView } from '../../components/ui';
import { friendlyError, humanize } from '../../lib/format';
import { db, must, useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Preferences = { density: string; high_contrast: boolean; text_size: string; start_page: string; date_format: string; browser_notifications: boolean; email_daily_summary: boolean };
// Same defaults as src/pages/PreferenciasPessoais.tsx.
const defaults: Preferences = { density: 'comfortable', high_contrast: false, text_size: 'normal', start_page: '/dashboard', date_format: 'DD/MM/YYYY', browser_notifications: true, email_daily_summary: false };
const columns = 'density,high_contrast,text_size,start_page,date_format,browser_notifications,email_daily_summary';

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return <View style={styles.toggle}><View style={styles.fill}><Text style={styles.label}>{label}</Text><Text style={styles.hint}>{hint}</Text></View>
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.surface} /></View>;
}

export default function ProfileScreen() {
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const clinicId = profile?.clinicaId;
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  const { data, loading, error, reload, refresh, refreshing } = useLoad(async client => {
    if (!userId || !clinicId) return undefined;
    const row = must<Partial<Preferences> | null>(await client.from('user_preferences').select(columns).eq('user_id', userId).eq('clinica_id', clinicId).maybeSingle());
    return { ...defaults, ...(row ?? {}) };
  }, [userId, clinicId]);

  const current = prefs ?? data ?? defaults;
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => { setPrefs({ ...current, [key]: value }); setFeedback(null); };
  const changed = (Object.keys(defaults) as (keyof Preferences)[]).filter(k => current[k] !== defaults[k]).length;
  const canAgenda = profile?.roles.some(r => ['admin', 'recepcao', 'enfermagem', 'medico'].includes(r));

  async function save() {
    if (!userId || !clinicId) return;
    setSaving(true);
    try {
      must(await db.from('user_preferences').upsert({ user_id: userId, clinica_id: clinicId, ...current }, { onConflict: 'user_id,clinica_id' }));
      setFeedback({ message: 'Preferências salvas.' });
    } catch (err) {
      setFeedback({ message: `Não foi possível salvar. Nada foi perdido. ${friendlyError(err)}`, error: true });
    } finally { setSaving(false); }
  }

  return <ModuleScreen moduleKey="perfil" subtitle="Seus dados de acesso e preferências nesta clínica." refreshing={refreshing} onRefresh={() => { setPrefs(null); refresh(); }}>
    <Card>
      <Text style={styles.name}>{profile?.nome || 'Sua conta'}</Text>
      <Text selectable style={styles.hint}>{session?.user.email ?? 'E-mail indisponível'}</Text>
      {profile?.roles.length ? <Text style={styles.roles}>{profile.roles.map(humanize).join(' · ')}</Text> : null}
    </Card>
    <Section title="Conta">
      <ListRow icon="shield-checkmark-outline" title="Segurança da conta" subtitle="Autenticação em dois fatores e sessões" onPress={() => router.push('/modules/seguranca')} />
      <ListRow icon="notifications-outline" title="Notificações" subtitle="Central de notificações" onPress={() => router.push('/modules/notificacoes')} />
      <ListRow icon="time-outline" title="Meu histórico" subtitle="Ações realizadas pela sua conta" onPress={() => router.push('/modules/meu-historico')} />
      <ListRow icon="chatbubble-ellipses-outline" title="Enviar opinião" subtitle="Sugestões e problemas do produto" onPress={() => router.push('/modules/feedback')} />
    </Section>
    <Section title="Minhas preferências">
      {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
      {!clinicId ? <StateView icon="business-outline" title="Clínica não identificada" message="Não foi possível identificar sua conta e clínica. Entre novamente." /> : loading ? <StateView loading title="Carregando preferências…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível carregar suas preferências." message={error} onAction={reload} /> : <>
        <Text style={styles.notice}>Estas opções ficam salvas na sua conta, separadas por usuário e por clínica. Os ajustes de interface valem para a versão web; o app segue as configurações do celular.{changed ? ` ${changed} ${changed === 1 ? 'ajuste diferente do padrão' : 'ajustes diferentes do padrão'}.` : ''}</Text>
        <Chips label="Densidade de conteúdo (web)" options={[{ value: 'comfortable', label: 'Confortável' }, { value: 'compact', label: 'Compacta' }]} value={current.density} onChange={v => set('density', v)} />
        <Chips label="Tamanho do texto (web)" options={[{ value: 'normal', label: 'Padrão' }, { value: 'large', label: 'Maior' }]} value={current.text_size} onChange={v => set('text_size', v)} />
        <Toggle label="Alto contraste (web)" hint="Reforça texto, bordas e indicadores de foco." value={current.high_contrast} onChange={v => set('high_contrast', v)} />
        <Chips label="Página inicial (web)" options={[{ value: '/dashboard', label: 'Dashboard' }, ...(canAgenda ? [{ value: '/agenda', label: 'Agenda' }] : []), { value: '/tarefas', label: 'Tarefas' }, { value: '/notificacoes', label: 'Notificações' }]} value={current.start_page} onChange={v => set('start_page', v)} />
        <Chips label="Formato curto de data (web)" options={[{ value: 'DD/MM/YYYY', label: 'DD/MM/AAAA' }, { value: 'YYYY-MM-DD', label: 'AAAA-MM-DD' }]} value={current.date_format} onChange={v => set('date_format', v)} />
        <Toggle label="Avisos no navegador (web)" hint="Exibe alertas enquanto a plataforma estiver aberta no navegador." value={current.browser_notifications} onChange={v => set('browser_notifications', v)} />
        <Toggle label="Resumo diário por e-mail" hint="A partir das 7h, no e-mail da sua conta: somente contagens do que seu perfil pode ver, sem nomes de pacientes. Depende do envio de e-mail da clínica estar ativo." value={current.email_daily_summary} onChange={v => set('email_daily_summary', v)} />
        <View style={styles.actions}>{changed ? <Button variant="ghost" icon="refresh" label="Restaurar padrão" onPress={() => { setPrefs(defaults); setFeedback(null); }} /> : null}<Button icon="save-outline" label={saving ? 'Salvando…' : 'Salvar preferências'} loading={saving} onPress={() => void save()} /></View>
      </>}
    </Section>
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  name: { color: colors.ink, fontSize: 16, fontWeight: '800' }, roles: { color: colors.primary, fontSize: 11, fontWeight: '700', marginTop: 8 },
  notice: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 14 }, label: { color: colors.ink, fontSize: 12, fontWeight: '700' }, hint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, marginBottom: 14 }, fill: { flex: 1 }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
});
