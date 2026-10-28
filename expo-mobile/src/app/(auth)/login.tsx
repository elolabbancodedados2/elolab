import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import logo from '../../../assets/elolab-logo-identidade.png';
import { useAuth } from '../../auth/useAuth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/tokens';

type AuthMode = 'login' | 'signup' | 'recovery' | 'mfa';

const loginAttempts = new Map<string, { count: number; startedAt: number; blockedUntil: number }>();

function checkLoginLimit(email: string) {
  const now = Date.now();
  const entry = loginAttempts.get(email);
  if (!entry || now - entry.startedAt > 60_000) {
    loginAttempts.set(email, { count: 1, startedAt: now, blockedUntil: 0 });
    return 0;
  }
  if (entry.blockedUntil > now) return entry.blockedUntil - now;
  entry.count += 1;
  if (entry.count > 5) {
    entry.blockedUntil = now + 120_000;
    return 120_000;
  }
  return 0;
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function maskCpfCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export default function LoginScreen() {
  const params = useLocalSearchParams<{ email?: string; codigo?: string; cadastro?: string }>();
  const { signIn, signUp, sendPasswordReset, signOut, configurationMissing } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  useEffect(() => {
    if (typeof params.email === 'string') setEmail(params.email);
    if (typeof params.codigo === 'string' && params.codigo) {
      setInviteCode(params.codigo.toUpperCase());
      setMode('signup');
    } else if (params.cadastro === '1') {
      setMode('signup');
    }
  }, [params.email, params.codigo, params.cadastro]);

  function changeMode(next: AuthMode) {
    setMode(next);
    setError('');
    setNotice('');
    setCanResendConfirmation(false);
  }

  function validateEmail() {
    if (!email.trim()) return 'Informe seu e-mail.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Digite um e-mail válido.';
    return '';
  }

  async function handleLogin() {
    setError('');
    setNotice('');
    const emailError = validateEmail();
    if (emailError) return setError(emailError);
    if (!password) return setError('Informe sua senha.');
    setCanResendConfirmation(false);
    const normalizedEmail = email.trim().toLowerCase();
    const retryAfter = checkLoginLimit(normalizedEmail);
    if (retryAfter) return setError(`Muitas tentativas seguidas. Aguarde ${Math.ceil(retryAfter / 60_000)} min e tente novamente.`);
    setSubmitting(true);
    try {
      const message = await signIn(normalizedEmail, password);
      if (message) {
        const lower = message.toLowerCase();
        const unconfirmed = lower.includes('email not confirmed') || lower.includes('email_not_confirmed');
        setCanResendConfirmation(unconfirmed);
        setError(unconfirmed
          ? 'Confirme seu e-mail para entrar. Se precisar, envie um novo link abaixo.'
          : lower.includes('invalid login credentials') || lower.includes('invalid_credentials')
            ? 'E-mail ou senha incorretos. Tente de novo ou redefina sua senha.'
            : lower.includes('rate limit') || lower.includes('too many')
              ? 'Muitas tentativas. Aguarde um pouco e tente de novo.'
              : lower.includes('user is banned') || lower.includes('account disabled') || lower.includes('user disabled')
                ? 'Sua conta está suspensa. Fale com o administrador da clínica.'
              : lower.includes('network') || lower.includes('fetch')
                ? 'Sem conexão. Verifique sua internet e tente de novo.'
                : 'Não foi possível entrar. Tente de novo em instantes.');
        return;
      }
      loginAttempts.delete(normalizedEmail);
      try {
        const aal = await supabase?.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.data?.nextLevel === 'aal2' && aal.data.nextLevel !== aal.data.currentLevel) {
          const { data: factors } = await supabase!.auth.mfa.listFactors();
          const factor = (factors?.totp ?? []).find(item => item.status === 'verified');
          if (factor) {
            setMfaFactorId(factor.id);
            setMode('mfa');
            return;
          }
        }
      } catch {
        // Mantém o comportamento do web: falha ao consultar MFA não invalida a senha aceita.
      }
      router.replace('/(tabs)');
    } catch {
      setError('Não foi possível entrar. Verifique sua conexão e tente de novo.');
    } finally {
      setSubmitting(false);
    }
  }

  async function resendConfirmation() {
    const emailError = validateEmail();
    if (emailError) return setError(emailError);
    if (!supabase) return;
    setSubmitting(true);
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: 'https://app.elolab.com.br/auth' } });
      if (resendError) throw resendError;
      setError('');
      setCanResendConfirmation(false);
      setNotice('Se este e-mail tiver um cadastro aguardando confirmação, enviaremos um novo link.');
    } catch {
      setError('Não foi possível reenviar o link agora. Tente novamente em instantes.');
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyMfa() {
    if (!/^\d{6}$/.test(mfaCode)) return setError('O código deve ter 6 dígitos.');
    if (!supabase || !mfaFactorId) return setError('Não foi possível iniciar a verificação. Entre novamente.');
    setSubmitting(true);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: mfaCode });
      if (verifyError) throw verifyError;
      setError('');
      router.replace('/(tabs)');
    } catch {
      setMfaCode('');
      setError('Código inválido ou expirado. Confira o aplicativo autenticador e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelMfa() {
    setSubmitting(true);
    try {
      await signOut();
    } finally {
      setMfaFactorId('');
      setMfaCode('');
      setSubmitting(false);
      changeMode('login');
    }
  }

  async function handleSignup() {
    setError('');
    setNotice('');
    const emailError = validateEmail();
    if (name.trim().length < 2) return setError('Informe seu nome completo.');
    if (emailError) return setError(emailError);
    if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return setError('A senha deve ter 10 caracteres e incluir letras maiúsculas, minúsculas e número.');
    }
    if (password !== confirmPassword) return setError('As senhas não coincidem.');
    const code = inviteCode.trim().toUpperCase();
    if (params.codigo && !code) return setError('Informe o código recebido no convite.');
    setSubmitting(true);
    try {
      if (code && supabase) {
        const { data, error: validationError } = await supabase.rpc('validate_invite_code', { _codigo: code });
        if (validationError) throw validationError;
        const validation = data as { valid?: boolean; error?: string };
        if (!validation?.valid) return setError(validation?.error || 'Este convite é inválido ou já foi usado. Peça um novo link ao administrador da clínica.');
      }
      const message = await signUp(email.trim().toLowerCase(), password, name.trim(), phone.trim(), cpfCnpj.trim(), code || undefined);
    if (message) {
      const lower = message.toLowerCase();
      setError(lower.includes('already registered') || lower.includes('already been registered')
        ? 'Este e-mail já tem uma conta. Entre ou use “Esqueci minha senha”.'
        : lower.includes('rate limit') || lower.includes('too many')
          ? 'Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.'
          : 'Não foi possível criar a conta agora. Confira os dados e tente novamente.');
      return;
    }
      const user = (await supabase?.auth.getUser())?.data.user;
      if (code && user && supabase) {
        const { data, error: activationError } = await supabase.rpc('activate_public_registration', { _user_id: user.id, _codigo_convite: code });
        if (activationError || !(data as { success?: boolean })?.success) {
          return setError('A conta foi criada, mas o convite ainda não foi ativado. Tente entrar novamente ou peça ajuda ao administrador.');
        }
      }
    setPassword('');
    setConfirmPassword('');
    setNotice('Conta criada. Confirme seu e-mail pelo link enviado para liberar o acesso.');
    if ((await supabase?.auth.getSession())?.data.session) router.replace('/(tabs)');
    } catch {
      setError('Não foi possível criar a conta agora. Verifique seus dados e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    setError('');
    setNotice('');
    const emailError = validateEmail();
    if (emailError) return setError(emailError);
    setSubmitting(true);
    try {
      const message = await sendPasswordReset(email.trim().toLowerCase());
      if (message) setError('Não foi possível enviar o link agora. Confira o e-mail e tente novamente.');
      else setNotice('Se houver uma conta para este e-mail, você receberá um link para redefinir sua senha.');
    } catch {
      setError('Não foi possível enviar o link agora. Verifique sua conexão e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  const recovering = mode === 'recovery';

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.topline}>
          <Image accessibilityLabel="EloLab — tecnologia que cuida" source={logo} resizeMode="contain" style={styles.logo} />
          <Text style={styles.taglineLine}>Gestão Clínica Inteligente</Text>
        </View>

        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>{mode === 'mfa' ? 'Verificação em duas etapas' : recovering ? 'Redefina sua senha' : mode === 'signup' ? 'Crie sua conta' : 'Acesse sua conta'}</Text>
          <Text style={styles.subtitle}>{mode === 'mfa' ? 'Sua conta usa autenticação em duas etapas.' : recovering ? 'Enviaremos um link para redefinir sua senha.' : mode === 'signup' ? 'Faça seu cadastro para começar com a EloLab.' : 'Entre com o e-mail e a senha cadastrados.'}</Text>

          {mode !== 'mfa' && !recovering ? <View accessibilityRole="tablist" style={styles.tabs}>
            {(['login', 'signup'] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: mode === tab }} onPress={() => changeMode(tab)} style={[styles.tab, mode === tab && styles.tabActive]}>
              <Text style={[styles.tabText, mode === tab && styles.tabTextActive]}>{tab === 'login' ? 'Entrar' : 'Criar conta'}</Text>
            </Pressable>)}
          </View> : recovering ? <Text style={styles.caption}>Informe o e-mail cadastrado na EloLab.</Text> : null}

          {mode === 'mfa' ? <Text style={styles.caption}>Digite o código de 6 dígitos do seu aplicativo autenticador.</Text> : null}

          {mode === 'signup' ? <>
            <Text style={styles.fieldLabel}>Nome completo</Text>
            <View style={styles.inputWrap}><Ionicons name="person-outline" size={18} color="#7A7A86" /><TextInput accessibilityLabel="Nome completo" autoCapitalize="words" autoComplete="name" onChangeText={setName} placeholder="Maria Souza" placeholderTextColor="#9A9AA6" returnKeyType="next" style={styles.input} value={name} /></View>
            <Text style={styles.fieldLabel}>Telefone (opcional)</Text>
            <View style={styles.inputWrap}><Ionicons name="call-outline" size={18} color="#7A7A86" /><TextInput accessibilityLabel="Telefone (opcional)" autoComplete="tel" keyboardType="phone-pad" onChangeText={value => setPhone(maskPhone(value))} placeholder="(11) 99999-9999" placeholderTextColor="#9A9AA6" returnKeyType="next" style={styles.input} value={phone} /></View>
            <Text style={styles.fieldLabel}>CPF ou CNPJ (opcional)</Text>
            <View style={styles.inputWrap}><Ionicons name="document-text-outline" size={18} color="#7A7A86" /><TextInput accessibilityLabel="CPF ou CNPJ (opcional)" keyboardType="number-pad" onChangeText={value => setCpfCnpj(maskCpfCnpj(value))} placeholder="CPF ou CNPJ (opcional)" placeholderTextColor="#9A9AA6" returnKeyType="next" style={styles.input} value={cpfCnpj} /></View>
            {params.codigo ? <><Text style={styles.fieldLabel}>Código do convite</Text><View style={styles.inputWrap}><Ionicons name="gift-outline" size={18} color="#7A7A86" /><TextInput accessibilityLabel="Código do convite" autoCapitalize="characters" onChangeText={value => setInviteCode(value.toUpperCase())} placeholder="Código recebido da clínica" placeholderTextColor="#9A9AA6" returnKeyType="next" style={styles.input} value={inviteCode} /></View></> : null}
          </> : null}

          {mode !== 'mfa' ? <><Text style={styles.fieldLabel}>E-mail</Text><View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={18} color="#7A7A86" />
            <TextInput accessibilityLabel="E-mail" autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={(value) => { setEmail(value); setError(''); setNotice(''); }} placeholder="seu@email.com" placeholderTextColor="#9A9AA6" returnKeyType="next" style={styles.input} value={email} />
          </View></> : null}
          {mode === 'login' || mode === 'signup' ? <><Text style={styles.fieldLabel}>Senha</Text><View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color="#7A7A86" />
            <TextInput accessibilityLabel="Senha" autoCapitalize="none" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} onChangeText={(value) => { setPassword(value); setError(''); }} onSubmitEditing={mode === 'login' ? handleLogin : undefined} placeholder="••••••••" placeholderTextColor="#9A9AA6" returnKeyType={mode === 'signup' ? 'next' : 'go'} secureTextEntry={!showPassword} style={styles.input} value={password} />
            <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'} hitSlop={10} onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color="#60606C" /></Pressable>
          </View></> : null}
          {mode === 'signup' ? <>
            <Text style={styles.passwordHint}>Use 10 caracteres, com letra maiúscula, minúscula e número.</Text>
            <Text style={styles.fieldLabel}>Confirmar senha</Text>
            <View style={styles.inputWrap}><Ionicons name="lock-closed-outline" size={18} color="#7A7A86" /><TextInput accessibilityLabel="Confirmar senha" autoCapitalize="none" autoComplete="new-password" onChangeText={value => { setConfirmPassword(value); setError(''); }} onSubmitEditing={handleSignup} placeholder="Confirme sua senha" placeholderTextColor="#9A9AA6" returnKeyType="go" secureTextEntry={!showConfirmPassword} style={styles.input} value={confirmPassword} /><Pressable accessibilityRole="button" accessibilityLabel={showConfirmPassword ? 'Ocultar confirmação da senha' : 'Mostrar confirmação da senha'} hitSlop={10} onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeButton}><Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color="#60606C" /></Pressable></View>
          </> : null}

          {mode === 'mfa' ? <><Text style={styles.fieldLabel}>Código</Text><View style={styles.inputWrap}><Ionicons name="shield-checkmark-outline" size={18} color="#7A7A86" /><TextInput accessibilityLabel="Código de verificação" autoComplete="one-time-code" keyboardType="number-pad" maxLength={6} onChangeText={value => { setMfaCode(value.replace(/\D/g, '')); setError(''); }} onSubmitEditing={verifyMfa} placeholder="000000" placeholderTextColor="#9A9AA6" returnKeyType="go" style={styles.input} value={mfaCode} /></View></> : null}

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {notice ? <Text accessibilityRole="status" style={styles.notice}>{notice}</Text> : null}
          {canResendConfirmation ? <Pressable accessibilityRole="button" disabled={submitting} onPress={resendConfirmation} style={styles.textAction}><Text style={styles.actionText}>Reenviar confirmação de e-mail</Text></Pressable> : null}
          {configurationMissing ? <View style={styles.configNotice}><Ionicons name="information-circle-outline" size={18} color={colors.warning} /><Text style={styles.configText}>Conexão do app pendente. Configure o Supabase para habilitar o acesso.</Text></View> : null}

          <Pressable accessibilityRole="button" disabled={submitting || configurationMissing || (mode === 'mfa' && mfaCode.length !== 6)} onPress={recovering ? handlePasswordReset : mode === 'signup' ? handleSignup : mode === 'mfa' ? verifyMfa : handleLogin} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, (submitting || configurationMissing) && styles.buttonDisabled]}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.buttonText}>{recovering ? 'Enviar link de redefinição' : mode === 'signup' ? 'Criar conta' : mode === 'mfa' ? 'Verificar código' : 'Acessar conta'}</Text>{!recovering ? <Ionicons name="arrow-forward" size={18} color="#FFFFFF" /> : null}</>}
          </Pressable>

          {mode === 'mfa' ? <Pressable accessibilityRole="button" disabled={submitting} onPress={cancelMfa} style={styles.textAction}><Text style={styles.actionText}>Cancelar e sair</Text></Pressable> :
            <Pressable accessibilityRole="button" disabled={submitting} onPress={() => changeMode(recovering ? 'login' : 'recovery')} style={styles.textAction}>
              <Text style={styles.actionText}>{recovering ? 'Voltar para entrar' : mode === 'signup' ? 'Já tem uma conta? Entrar' : 'Esqueci minha senha'}</Text>
            </Pressable>}

          <View style={styles.divider} />
          <View style={styles.footer}><Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} /><Text style={styles.footerTitle}>Acesso protegido para sua clínica</Text></View>
          <Text style={styles.footerCopy}>Seus dados de acesso são tratados com cuidado.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#F2F4F7' },
  page: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: 30, paddingBottom: 28 },
  topline: { width: '100%', maxWidth: 430, alignSelf: 'center', alignItems: 'center', marginBottom: 34, gap: 5 },
  logo: { width: 154, height: 42 },
  taglineLine: { color: '#40546A', fontSize: 14, lineHeight: 20 },
  card: { width: '100%', maxWidth: 430, alignSelf: 'center', paddingHorizontal: 0, paddingVertical: 0, backgroundColor: 'transparent' },
  subtitle: { color: '#40546A', textAlign: 'left', fontSize: 14, lineHeight: 20, marginBottom: 22 },
  title: { color: '#151923', textAlign: 'left', fontSize: 24, fontWeight: '700', letterSpacing: -0.4, marginBottom: 3 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: '#E6E9EE', marginBottom: 24 },
  tab: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: '#FFFFFF', shadowColor: colors.deep, shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
  caption: { color: colors.muted, textAlign: 'left', fontSize: 13, lineHeight: 19, marginBottom: 15 },
  fieldLabel: { color: '#151923', fontSize: 13, fontWeight: '500', marginBottom: 7 },
  inputWrap: { minHeight: 50, borderWidth: 1, borderColor: '#DDE2E8', borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F6F7F9', marginBottom: 17 },
  input: { flex: 1, minHeight: 48, color: colors.ink, fontSize: 14 },
  eyeButton: { minWidth: 30, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  passwordHint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: -5, marginBottom: 10 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  notice: { color: colors.success, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  configNotice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 2, padding: 11, borderRadius: 11, backgroundColor: colors.warningSoft },
  configText: { flex: 1, color: '#805812', fontSize: 12, lineHeight: 17 },
  button: { minHeight: 52, borderRadius: 14, backgroundColor: colors.primary, marginTop: 8, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  buttonPressed: { backgroundColor: colors.primaryDark, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  textAction: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginTop: 4, marginBottom: 14 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  footerTitle: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  footerCopy: { color: colors.muted, textAlign: 'center', fontSize: 11, marginTop: 5 },
});
