import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Badge, Button, Card, Feedback, Field, ListRow, Section, StateView } from '../../components/ui';
import { dateLabel, friendlyError } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import { colors } from '../../theme/tokens';

type Enroll = { factorId: string; secret: string; uri: string };
type Mode = null | 'enroll' | 'disable';
const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

export default function SecurityScreen() {
  const { session, profile, signOut, sendPasswordReset } = useAuth();
  const email = session?.user.email ?? '';
  const [mode, setMode] = useState<Mode>(null);
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);

  // 2FA state comes from Supabase Auth (verified TOTP factor), same as the web.
  const { data, loading, error, reload, refresh, refreshing } = useLoad(async () => {
    if (!supabase || !session) return undefined;
    const { data: factors, error: err } = await supabase.auth.mfa.listFactors();
    if (err) throw err;
    const verified = (factors?.totp ?? []).find(f => f.status === 'verified');
    return { factorId: verified?.id ?? null, setupDate: verified?.created_at ?? null };
  }, [session?.user.id]);
  const enabled = Boolean(data?.factorId);

  const done = (message: string, isError = false) => { setFeedback({ message, error: isError }); setBusy(null); };

  async function startEnroll() {
    if (!supabase) return;
    setBusy('enroll'); setFeedback(null);
    try {
      // Remove pending TOTP factors left by earlier attempts.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.totp ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: res, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `EloLab ${new Date().toISOString().slice(0, 10)}` });
      if (err) throw err;
      setEnroll({ factorId: res.id, secret: res.totp.secret, uri: res.totp.uri });
      setMode('enroll'); setCode(''); setBusy(null);
    } catch (err) { done(friendlyError(err, 'Erro ao iniciar configuração do 2FA.'), true); }
  }

  async function cancel() {
    // Drop the unverified factor so the account is not left with leftovers.
    if (mode === 'enroll' && enroll && supabase) await supabase.auth.mfa.unenroll({ factorId: enroll.factorId }).catch(() => undefined);
    setMode(null); setEnroll(null); setCode('');
  }

  async function verify() {
    if (!supabase || !/^\d{6}$/.test(code)) return setFeedback({ message: 'O código deve ter 6 dígitos.', error: true });
    const factorId = mode === 'enroll' ? enroll?.factorId : data?.factorId;
    if (!factorId) return;
    setBusy('verify'); setFeedback(null);
    try {
      // Server-side verification; also raises the session to AAL2 (required to unenroll).
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (err) throw err;
      if (mode === 'disable') {
        const { error: unErr } = await supabase.auth.mfa.unenroll({ factorId });
        if (unErr) throw unErr;
      }
      const message = mode === 'enroll' ? 'Autenticação de dois fatores ativada!' : 'Autenticação 2FA desativada.';
      setMode(null); setEnroll(null); setCode('');
      done(message);
      reload();
    } catch (err) { setCode(''); done(friendlyError(err, 'Código inválido. Tente novamente.'), true); }
  }

  function signOutAll() {
    Alert.alert('Encerrar todas as sessões?', 'Você sairá deste dispositivo e dos demais. Será necessário entrar novamente.', [{ text: 'Voltar', style: 'cancel' }, { text: 'Encerrar sessões', style: 'destructive', onPress: () => void (async () => {
      if (!supabase) return;
      setBusy('signout');
      const { error: err } = await supabase.auth.signOut({ scope: 'global' });
      if (err) return done(friendlyError(err, 'Erro ao encerrar sessões.'), true);
      await signOut();
    })() }]);
  }

  function resetPassword() {
    Alert.alert('Redefinir senha?', `Enviaremos um link de redefinição para ${email}.`, [{ text: 'Voltar', style: 'cancel' }, { text: 'Enviar link', onPress: () => void (async () => {
      setBusy('reset');
      const err = await sendPasswordReset(email);
      done(err ?? 'Enviamos o link de redefinição para o seu e-mail.', Boolean(err));
    })() }]);
  }

  return <ModuleScreen moduleKey="seguranca" title="Segurança da Conta" subtitle={`Gerencie autenticação, sessões e proteção da sua conta${!loading && !error ? ` · 2FA ${enabled ? 'ativado' : 'desativado'}` : ''}`} refreshing={refreshing} onRefresh={refresh}>
    {feedback ? <Feedback message={feedback.message} error={feedback.error} /> : null}
    <Card style={styles.card}>
      <View style={styles.head}><Text style={styles.title}>Autenticação em Dois Fatores (2FA)</Text><Badge label={loading ? 'Verificando…' : error ? 'Status indisponível' : enabled ? 'Ativado' : 'Desativado'} tone={error ? 'danger' : enabled ? 'success' : 'warning'} /></View>
      <Text style={styles.text}>Adicione uma camada extra de segurança usando um app authenticator.</Text>
      {loading ? <StateView loading title="Verificando…" /> : error ? <StateView icon="alert-circle-outline" title="Não foi possível confirmar o estado do 2FA." message="Tente novamente antes de alterar esta proteção." onAction={reload} /> : mode === 'enroll' && enroll ? <View style={styles.flow}>
        <Text style={styles.text}>Abra seu aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password ou similar), escolha adicionar conta com chave e digite o código abaixo. Toque e segure para copiar.</Text>
        <Text selectable accessibilityLabel="Chave do autenticador" style={styles.secret}>{enroll.secret}</Text>
        <Text style={styles.small}>Endereço para apps que aceitam colar o link:</Text>
        <Text selectable style={styles.uri}>{enroll.uri}</Text>
        <Field label="Código de 6 dígitos" value={code} onChangeText={v => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" placeholder="000000" />
        <View style={styles.actions}><Button variant="ghost" label="Cancelar" disabled={busy === 'verify'} onPress={() => void cancel()} /><Button label="Ativar 2FA" loading={busy === 'verify'} disabled={code.length !== 6} onPress={() => void verify()} /></View>
      </View> : mode === 'disable' ? <View style={styles.flow}>
        <Text style={styles.strong}>Desativar autenticação 2FA?</Text>
        <Text style={styles.text}>Sua conta ficará protegida somente pela senha. Para confirmar, digite o código atual do seu autenticador.</Text>
        <Field label="Código do autenticador" value={code} onChangeText={v => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" placeholder="000000" />
        <View style={styles.actions}><Button variant="ghost" label="Cancelar" disabled={busy === 'verify'} onPress={() => void cancel()} /><Button variant="danger" label="Confirmar identidade" loading={busy === 'verify'} disabled={code.length !== 6} onPress={() => void verify()} /></View>
      </View> : enabled ? <>
        {data?.setupDate ? <Text style={styles.small}>Ativado em: {dateLabel(data.setupDate).slice(0, 10)}</Text> : null}
        <Button variant="danger" label="Desativar 2FA" onPress={() => { setMode('disable'); setCode(''); setFeedback(null); }} />
      </> : <>
        <Text style={styles.warn}>Sua conta {profile?.roles.includes('admin') ? 'administrativa ' : ''}está protegida apenas por senha. Recomendamos fortemente ativar a autenticação 2FA.</Text>
        <Button icon="key-outline" label="Ativar 2FA" loading={busy === 'enroll'} onPress={() => void startEnroll()} />
      </>}
    </Card>
    <Section title="Senha">
      <Card style={styles.card}><Text style={styles.text}>Para trocar a senha, enviaremos um link de redefinição ao e-mail da conta.</Text><Button variant="secondary" icon="mail-outline" label="Enviar link de redefinição" loading={busy === 'reset'} disabled={!email} onPress={resetPassword} /></Card>
    </Section>
    <Section title="Sessões Ativas">
      <Card style={styles.card}><Text style={styles.text}>Encerre todas as sessões em outros dispositivos.</Text><Text selectable style={styles.small}>Email da conta: {email}</Text><Button variant="secondary" icon="log-out-outline" label="Encerrar todas as sessões" loading={busy === 'signout'} onPress={signOutAll} /></Card>
    </Section>
    <Section title="Atalhos">
      <ListRow icon="time-outline" title="Meu histórico" onPress={() => router.push('/modules/meu-historico')} />
      <ListRow icon="options-outline" title="Preferências" onPress={() => router.push('/modules/perfil')} />
    </Section>
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  card: { gap: 10 }, head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }, title: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '800' },
  text: { color: colors.muted, fontSize: 12, lineHeight: 18 }, strong: { color: colors.ink, fontSize: 13, fontWeight: '700' }, small: { color: colors.muted, fontSize: 11 }, warn: { color: colors.warning, backgroundColor: colors.warningSoft, borderRadius: 12, padding: 10, fontSize: 12, lineHeight: 18 },
  flow: { gap: 8 }, secret: { color: colors.ink, backgroundColor: colors.surfaceMuted, borderRadius: 10, padding: 12, fontSize: 15, fontWeight: '700', letterSpacing: 1, fontFamily: mono }, uri: { color: colors.muted, backgroundColor: colors.surfaceMuted, borderRadius: 10, padding: 10, fontSize: 10, fontFamily: mono },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
