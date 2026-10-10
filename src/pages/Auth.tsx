import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { MaskedInput } from '@/components/ui/masked-input';
import {
  Loader2, Eye, EyeOff, Shield,
  Gift, CheckCircle2, Lock, Mail, User, Phone, FileText, CreditCard,
  CalendarDays, ClipboardList, Stethoscope, FlaskConical,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { checkRateLimit, resetRateLimit } from '@/lib/rateLimiter';
import { MFAVerifyDialog } from '@/components/MFAVerifyDialog';
import { passwordSchema } from '@/lib/passwordPolicy';
import { AuthSwitch } from '@/components/ui/auth-switch';
import { interpretarErroLogin, loginSchema, type LoginFormData } from '@/lib/authValidation';
import logoHorizontal from '@/assets/elolab-logo-identidade.png';
import authBackground from '@/assets/auth-background-elolab.png';

// ─── Schemas ───────────────────────────────────────────────
const signupSchema = z.object({
  nome: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  telefone: z.string().optional(),
  cpfCnpj: z.string().optional(),
  email: z.string().trim().email('Digite um e-mail válido.'),
  password: passwordSchema,
  confirmPassword: z.string().min(1, 'Confirme a senha'),
  codigoConvite: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

type SignupForm = z.infer<typeof signupSchema>;

// ─── Animations ────────────────────────────────────────────
const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 30 : -30, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -30 : 30, opacity: 0 }),
};

// ─── Component ─────────────────────────────────────────────
export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, user, profile, isLoading: authLoading } = useSupabaseAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loginFeedback, setLoginFeedback] = useState<{ message: string; tone: 'error' | 'success'; canResend: boolean } | null>(null);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [direction, setDirection] = useState(0);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [activationStatus, setActivationStatus] = useState<'idle' | 'waiting_email' | 'activating' | 'active' | 'failed'>('idle');
  const [activationCode, setActivationCode] = useState('');
  const activationRequests = useRef(new Map<string, Promise<boolean>>());
  /** Fator TOTP a confirmar: senha aceita, sessão ainda em AAL1. */
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);

  const urlCodigo = searchParams.get('codigo') || '';
  const urlEmail = searchParams.get('email') || '';
  const urlMpStatus = searchParams.get('status') || '';
  const urlRegistroId = searchParams.get('id') || '';
  const urlCadastro = searchParams.get('cadastro') === '1';
  const urlPlan = searchParams.get('plano') || '';
  const urlPlanMode = searchParams.get('modo') || '';
  const hasPlanIntent = /^[a-z0-9-]+$/i.test(urlPlan) && ['trial', 'buy'].includes(urlPlanMode);

  useEffect(() => {
    if (urlCodigo || urlCadastro) { setActiveTab('signup'); setDirection(1); }
  }, [urlCodigo, urlCadastro]);

  // Feedback visual quando cliente volta do Mercado Pago checkout
  useEffect(() => {
    if (!urlMpStatus) return;
    if (urlMpStatus === 'success') {
      toast.success('Pagamento aprovado! Verifique seu email para o código de ativação.', {
        duration: 8000,
      });
      setActiveTab('signup');
      setDirection(1);
    } else if (urlMpStatus === 'pending') {
      toast.info('Pagamento em processamento. Você receberá o código por email assim que for aprovado.', {
        duration: 8000,
      });
    } else if (urlMpStatus === 'error') {
      toast.error('Pagamento não foi concluído. Tente novamente ou escolha outra forma de pagamento.', {
        duration: 8000,
      });
    }
  }, [urlMpStatus, urlRegistroId]);

  useEffect(() => {
    const host = window.location.hostname;
    if (host === 'elolab.com.br' || host === 'www.elolab.com.br') {
      const targetUrl = `https://app.elolab.com.br${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(targetUrl);
    }
  }, []);

  useEffect(() => {
    const activationFinished = activationStatus === 'active' || (activationStatus === 'idle' && !urlCodigo && !hasPlanIntent);
    if (!authLoading && user && profile && activationFinished) navigate('/dashboard');
  }, [user, profile, authLoading, navigate, activationStatus, urlCodigo, hasPlanIntent]);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: urlEmail || '', password: '' },
  });

  const signupForm = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      nome: '', telefone: '', cpfCnpj: '', email: urlEmail || '', password: '', confirmPassword: '',
      codigoConvite: urlCodigo || '',
    },
  });
  const resetSignupForm = signupForm.reset;

  useEffect(() => {
    if (!user?.id || authLoading || !hasPlanIntent) return;
    const trialQuery = urlPlanMode === 'trial' ? '?trial=1' : '';
    navigate(`/planos/checkout/${encodeURIComponent(urlPlan)}${trialQuery}`, { replace: true });
  }, [user?.id, authLoading, hasPlanIntent, urlPlanMode, urlPlan, navigate]);

  const handleTabChange = (tab: 'login' | 'signup') => {
    setDirection(tab === 'signup' ? 1 : -1);
    setActiveTab(tab);
  };

  /**
   * Após a senha, se a conta tiver um fator TOTP verificado, a sessão fica em
   * AAL1 e só vira AAL2 depois do código. Antes disso o app já liberava tudo:
   * o 2FA existia na tela de Segurança mas nunca era exigido no login.
   */
  const requiresSecondFactor = async (): Promise<string | null> => {
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel !== 'aal2' || aal.nextLevel === aal.currentLevel) return null;

      const { data: factors } = await supabase.auth.mfa.listFactors();
      return (factors?.totp ?? []).find(f => f.status === 'verified')?.id ?? null;
    } catch {
      return null;
    }
  };

  const onLogin = async (data: LoginFormData) => {
    const email = data.email.trim().toLowerCase();
    const rateKey = `login:${email}`;
    setLoginFeedback(null);
    const { allowed, retryAfterMs } = checkRateLimit(rateKey, 'auth');
    if (!allowed) {
      const minutes = Math.ceil(retryAfterMs / 60000);
      setLoginFeedback({ message: `Muitas tentativas seguidas. Aguarde ${minutes} min e tente novamente.`, tone: 'error', canResend: false });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await signIn(email, data.password);
      if (error) {
        const feedback = interpretarErroLogin(error);
        setLoginFeedback({ message: feedback.message, tone: 'error', canResend: feedback.canResendConfirmation });
      } else {
        resetRateLimit(rateKey);
        setLoginFeedback(null);

        const factorId = await requiresSecondFactor();
        if (factorId) {
          setPendingFactorId(factorId);
          return;
        }

        toast.success('Login realizado!');
        navigate('/dashboard');
      }
    } catch (e) {
      const feedback = interpretarErroLogin(e);
      setLoginFeedback({ message: feedback.message, tone: 'error', canResend: feedback.canResendConfirmation });
    } finally {
      setIsLoading(false);
    }
  };

  const reenviarConfirmacao = async () => {
    const emailResult = loginSchema.shape.email.safeParse(loginForm.getValues('email'));
    if (!emailResult.success) {
      loginForm.setError('email', { type: 'manual', message: emailResult.error.issues[0]?.message || 'Digite um e-mail válido.' });
      return;
    }
    setResendingConfirmation(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: emailResult.data.toLowerCase(),
        options: { emailRedirectTo: 'https://app.elolab.com.br/auth' },
      });
      if (error) throw error;
      setLoginFeedback({
        message: 'Se este e-mail tiver um cadastro aguardando confirmação, enviaremos um novo link.',
        tone: 'success',
        canResend: false,
      });
    } catch (error) {
      const feedback = interpretarErroLogin(error);
      setLoginFeedback({ message: feedback.message, tone: 'error', canResend: feedback.canResendConfirmation });
    } finally {
      setResendingConfirmation(false);
    }
  };

  const handleMfaVerified = () => {
    setPendingFactorId(null);
    toast.success('Login realizado!');
    navigate('/dashboard');
  };

  const handleMfaCancel = async () => {
    setPendingFactorId(null);
    await supabase.auth.signOut();
    toast.info('Login cancelado');
  };

  const activateSubscription = useCallback(async (userId: string, codigoConvite: string): Promise<boolean> => {
    const key = `${userId}:${codigoConvite}`;
    const existingRequest = activationRequests.current.get(key);
    if (existingRequest) return existingRequest;

    const request = (async () => {
      try {
        const { data: result, error: rpcError } = await supabase.rpc(
          'activate_public_registration' as any,
          { _user_id: userId, _codigo_convite: codigoConvite }
        );

        if (rpcError) throw rpcError;
        const res = result as any;
        if (!res?.success) throw new Error(res?.error || 'Não foi possível ativar o plano.');

        if (res.mode === 'paid') toast.success(`Plano ${res.plano_nome} ativado! 🎉`);
        else if (res.mode === 'trial') toast.success(`Teste grátis ativado! Plano ${res.plano_nome}. 🎉`);
        else toast.success(`Plano ${res.plano_nome} ativado!`);
        return true;
      } catch (err) {
        if (import.meta.env.DEV) console.error('Erro ao ativar assinatura:', err);
        toast.error('Não foi possível ativar o plano. Tente novamente.');
        return false;
      }
    })();

    activationRequests.current.set(key, request);
    const activated = await request;
    if (!activated) activationRequests.current.delete(key);
    return activated;
  }, []);

  useEffect(() => {
    if (!user?.id || !urlCodigo || authLoading) return;
    let active = true;
    setActivationCode(urlCodigo);
    setActivationStatus('activating');
    void activateSubscription(user.id, urlCodigo).then((activated) => {
      if (!active) return;
      setActivationStatus(activated ? 'active' : 'failed');
      if (activated) {
        setSignupSuccess(true);
        resetSignupForm();
      }
    });
    return () => { active = false; };
  }, [user?.id, urlCodigo, authLoading, activateSubscription, resetSignupForm]);

  const onSignup = async (data: SignupForm) => {
    const email = data.email.trim().toLowerCase();
    const inviteCode = urlCodigo ? (data.codigoConvite || '').trim().toUpperCase() : '';
    if (urlCodigo && !inviteCode) {
      signupForm.setError('codigoConvite', { type: 'manual', message: 'Informe o código recebido no convite.' });
      return;
    }
    const rateKey = `signup:${email}`;
    const { allowed, retryAfterMs } = checkRateLimit(rateKey, 'auth');
    if (!allowed) {
      const minutes = Math.ceil(retryAfterMs / 60000);
      toast.error(`Muitas tentativas. Tente novamente em ${minutes} min.`);
      return;
    }
    setIsLoading(true);
    try {
      if (inviteCode) {
        const { data: validation, error: valError } = await supabase.rpc(
          'validate_invite_code' as any,
          { _codigo: inviteCode }
        );
        if (valError) throw valError;
        const valResult = validation as any;
        if (!valResult?.valid) {
          toast.error(valResult?.error || 'Este convite é inválido ou já foi utilizado. Peça um novo link ao administrador da clínica.');
          return;
        }
      }

      const activationRedirect = new URL('https://app.elolab.com.br/auth');
      if (inviteCode) activationRedirect.searchParams.set('codigo', inviteCode);
      else {
        activationRedirect.searchParams.set('cadastro', '1');
        if (hasPlanIntent) {
          activationRedirect.searchParams.set('plano', urlPlan);
          activationRedirect.searchParams.set('modo', urlPlanMode);
        }
      }
      if (inviteCode) {
        setActivationCode(inviteCode);
        setActivationStatus('activating');
      }
      const result = await signUp(email, data.password, data.nome, data.telefone, data.cpfCnpj, activationRedirect.toString());
      if (result.error) {
        setActivationStatus('idle');
        if (/user already registered|already been registered/i.test(result.error.message)) {
          toast.error('Este e-mail já tem uma conta. Entre ou use “Esqueci minha senha”.');
        } else if (/password/i.test(result.error.message)) {
          toast.error('A senha não atende aos requisitos. Confira as orientações e tente novamente.');
        } else if (/rate limit|too many/i.test(result.error.message)) {
          toast.error('Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.');
        } else {
          toast.error('Não foi possível criar a conta agora. Tente novamente em instantes.');
        }
      } else {
        const userId = result.data?.user?.id;
        if (!userId) {
          setActivationStatus('failed');
          toast.error('O cadastro foi enviado, mas não recebemos a confirmação da conta. Confira seu e-mail e tente entrar.');
          return;
        }

        if (result.data?.session) {
          if (inviteCode) {
            const activated = await activateSubscription(userId, inviteCode);
            setActivationStatus(activated ? 'active' : 'failed');
            setSignupSuccess(activated);
            if (activated) signupForm.reset();
          } else {
            signupForm.reset();
            if (!hasPlanIntent) navigate('/onboarding');
          }
        } else {
          setActivationStatus('waiting_email');
          setSignupSuccess(true);
          signupForm.reset();
          toast.success('Conta criada. Confirme seu e-mail para continuar.');
        }
      }
    } catch (e) {
      setActivationStatus('idle');
      toast.error('Não foi possível criar a conta agora. Verifique seus dados e tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Loading state ───────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-[#edf5ff]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <img src={logoHorizontal} alt="EloLab" className="w-56 object-contain" />
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </motion.div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className="relative min-h-svh overflow-x-hidden bg-[#edf5ff] text-[#10264e]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <img src={authBackground} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-white/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_48%,rgba(255,255,255,0.06)_0%,rgba(237,245,255,0.12)_65%,rgba(237,245,255,0.35)_100%)]" />
      </div>

      <header className="relative z-20 flex h-[82px] items-center justify-between px-5 sm:px-8 xl:px-14">
        <Link to="/auth" aria-label="EloLab — início do acesso" className="inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4">
          <img src={logoHorizontal} alt="EloLab — tecnologia que cuida" className="w-[172px] object-contain sm:w-[205px]" />
        </Link>
        <div className="hidden text-right text-xs leading-relaxed text-[#58739f] sm:block">
          <p>Cuidar hoje.</p>
          <p>Construir o amanhã.</p>
          <span className="mt-2 ml-auto block h-0.5 w-7 rounded-full bg-primary" />
        </div>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100svh-154px)] w-full max-w-[1680px] grid-cols-1 items-center gap-7 px-4 py-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(420px,490px)_minmax(0,1fr)] lg:gap-8 xl:px-14">
        <aside className="hidden self-center lg:block">
          <div className="max-w-[220px] border-l border-[#8ba9d4]/55 py-1 pl-4 text-[11px] font-medium uppercase tracking-[0.14em] text-[#58739f]">
            <p className="-ml-[18px] flex items-center gap-2 font-semibold text-[#10264e]"><span className="h-5 w-1 rounded-full bg-primary" />Saúde</p>
            <p className="mt-4">Gestão</p>
            <p className="mt-4">Tecnologia</p>
            <p className="mt-4">Pessoas</p>
          </div>
          <p className="mt-6 max-w-[190px] text-sm leading-relaxed text-[#58739f]">Tudo o que sua clínica precisa, em um só lugar.</p>
          <div className="mt-9 space-y-3 text-xs text-[#45658f]">
            <div className="flex items-center gap-2.5"><CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />Agenda e atendimento</div>
            <div className="flex items-center gap-2.5"><ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />Prontuário e exames</div>
            <div className="flex items-center gap-2.5"><Stethoscope className="h-4 w-4 text-primary" aria-hidden="true" />Gestão da clínica</div>
          </div>
        </aside>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 mx-auto w-full max-w-[490px] rounded-[28px] border border-white/90 bg-white/65 px-6 py-7 shadow-[0_28px_90px_-38px_rgba(27,85,158,0.38)] backdrop-blur-2xl sm:px-10 sm:py-9"
        >
          <div className="mb-6 text-center">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6680a7]">
              {activeTab === 'login' ? 'Bem-vindo à' : urlCodigo ? 'Convite EloLab' : 'Crie sua conta'}
            </p>
            <img src={logoHorizontal} alt="EloLab — tecnologia que cuida" className="mx-auto w-[178px] object-contain sm:w-[195px]" />
            <p className="mx-auto mt-3 max-w-[300px] text-sm leading-relaxed text-[#58739f]">
              {activeTab === 'login' ? 'Acesse sua conta e continue cuidando de vidas.' : 'Faça seu cadastro para começar com a EloLab.'}
            </p>
          </div>

          {/* Invite banner */}
          <AnimatePresence>
            {urlCodigo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-5 p-3.5 bg-primary/5 border border-primary/15 rounded-xl flex items-center gap-3"
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Gift className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#10264e]">Convite da equipe detectado</p>
                  <p className="text-xs text-[#6680a7]">Preencha seus dados para entrar na clínica.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Heading */}
          <div className="mb-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="sr-only">
                  {activeTab === 'login' ? 'Acesse sua conta' : urlCodigo ? 'Aceite o convite' : 'Crie sua conta'}
                </h2>
                <p className="sr-only">
                  {activeTab === 'login'
                    ? 'Entre com o e-mail e a senha cadastrados'
                    : urlCodigo ? 'Entre para fazer parte da equipe da clínica' : 'Cadastre-se para começar'}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Auth Switch */}
          <div className="mb-6">
            <AuthSwitch activeTab={activeTab} onTabChange={handleTabChange} />
          </div>

          {/* Form content */}
          <AnimatePresence mode="wait" custom={direction}>
            {activeTab === 'login' ? (
              <motion.div
                key="login"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                    {loginFeedback && (
                      <Alert
                        role={loginFeedback.tone === 'error' ? 'alert' : 'status'}
                        className={loginFeedback.tone === 'success' ? 'border-success/30 bg-success/5 text-success-foreground' : undefined}
                        variant={loginFeedback.tone === 'error' ? 'destructive' : 'default'}
                      >
                        <AlertDescription className="space-y-2">
                          <span>{loginFeedback.message}</span>
                          {loginFeedback.canResend && (
                            <Button type="button" variant="link" size="sm" className="h-auto p-0 font-semibold" disabled={resendingConfirmation} onClick={() => void reenviarConfirmacao()}>
                              {resendingConfirmation ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Enviando…</> : 'Reenviar link de confirmação'}
                            </Button>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">E-mail</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6680a7]/40" />
                              <Input
                                aria-label="E-mail"
                                type="email"
                                placeholder="seu@email.com"
                                autoComplete="email"
                                autoCapitalize="none"
                                spellCheck={false}
                                className="h-[50px] rounded-[14px] border-[#d8e5f7] bg-white/70 pl-11 text-[#10264e] placeholder:text-[#8297b7] focus:border-primary focus:bg-white focus:ring-primary/15"
                                {...field}
                                onChange={(event) => { setLoginFeedback(null); field.onChange(event); }}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">Senha</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6680a7]/40" />
                              <Input
                                aria-label="Senha"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                className="h-[50px] rounded-[14px] border-[#d8e5f7] bg-white/70 pl-11 pr-12 text-[#10264e] placeholder:text-[#8297b7] focus:border-primary focus:bg-white focus:ring-primary/15"
                                {...field}
                                onChange={(event) => { setLoginFeedback(null); field.onChange(event); }}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword
                                  ? <EyeOff className="h-4 w-4 text-[#6680a7]" />
                                  : <Eye className="h-4 w-4 text-[#6680a7]" />}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="h-[52px] w-full rounded-[14px] bg-gradient-to-r from-[#0765e8] via-[#0878f9] to-[#278dff] text-sm font-bold text-white shadow-[0_12px_24px_-12px_rgba(0,103,235,0.7)] transition hover:brightness-105 hover:shadow-[0_15px_28px_-12px_rgba(0,103,235,0.75)]"
                      disabled={isLoading}
                    >
                      {isLoading ? <><Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />Entrando…</> : 'Entrar'}
                    </Button>
                    {/* Até aqui não havia saída para quem esquecia a senha: o app
                        não tinha nenhuma chamada de recuperação. */}
                    <Link
                      to="/redefinir-senha"
                      className="inline-flex min-h-9 w-full items-center justify-center text-center text-sm font-medium text-primary hover:text-primary/80"
                    >
                      Esqueci minha senha
                    </Link>
                  </form>
                </Form>
              </motion.div>
            ) : (
              <motion.div
                key="signup"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                {signupSuccess ? (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                    <Alert className="border-primary/20 bg-primary/5">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <AlertDescription>
                        {activationStatus === 'waiting_email'
                          ? hasPlanIntent && urlPlanMode === 'buy'
                            ? 'Conta criada. Confirme seu e-mail pelo link enviado; depois você seguirá direto para o pagamento do plano.'
                            : hasPlanIntent
                              ? 'Conta criada. Confirme seu e-mail; depois você configura o cartão no EloLab para iniciar o teste.'
                              : 'Conta criada. Confirme seu e-mail pelo link enviado para liberar o acesso.'
                          : activationStatus === 'activating'
                            ? 'Conta criada. Estamos ativando seu plano…'
                            : urlCodigo
                              ? 'Convite aceito e conta criada. Faça login para acessar.'
                              : 'Conta criada. Estamos preparando seu primeiro acesso.'}
                      </AlertDescription>
                    </Alert>
                  </motion.div>
                ) : (
                  <>
                  {activationStatus === 'failed' && (
                    <Alert variant="destructive" className="mb-3">
                      <AlertDescription className="space-y-3">
                        A conta existe, mas a ativação do plano ainda não foi concluída. Tente novamente; seu código foi mantido.
                        {user?.id && activationCode && (
                          <Button type="button" variant="outline" size="sm" onClick={async () => {
                            setActivationStatus('activating');
                            const activated = await activateSubscription(user.id, activationCode);
                            setActivationStatus(activated ? 'active' : 'failed');
                            if (activated) { setSignupSuccess(true); resetSignupForm(); }
                          }}>Tentar ativar plano</Button>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                  <Form {...signupForm}>
                    <form onSubmit={signupForm.handleSubmit(onSignup)} className="space-y-3.5">
                      {urlCodigo ? (
                        <Alert className="border-primary/20 bg-primary/5">
                          <Gift className="h-4 w-4 text-primary" />
                          <AlertDescription>Convite da equipe identificado. Conclua o cadastro para entrar na clínica.</AlertDescription>
                        </Alert>
                      ) : (
                        <Alert className="border-primary/20 bg-primary/5">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          <AlertDescription>
                            Crie sua conta com e-mail e senha. O convite da equipe é enviado separadamente pelo administrador da clínica.
                          </AlertDescription>
                        </Alert>
                      )}
                      <FormField
                        control={signupForm.control}
                        name="nome"
                        render={({ field }) => (
                          <FormItem>
                          <FormLabel className="sr-only">Nome completo</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6680a7]/40" />
                                <Input aria-label="Nome completo" placeholder="Maria Souza" autoComplete="name" className="h-[50px] rounded-[14px] border-[#d8e5f7] bg-white/70 pl-11 text-[#10264e] placeholder:text-[#8297b7] focus:border-primary focus:bg-white focus:ring-primary/15" {...field} />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signupForm.control}
                        name="telefone"
                        render={({ field }) => (
                          <FormItem>
                          <FormLabel className="sr-only">Telefone (opcional)</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6680a7]/40" />
                                <MaskedInput
                                  aria-label="Telefone (opcional)"
                                  mask="phone"
                                  placeholder="(11) 99999-9999"
                                  autoComplete="tel"
                                  className="h-[50px] rounded-[14px] border-[#d8e5f7] bg-white/70 pl-11 text-[#10264e] placeholder:text-[#8297b7] focus:border-primary focus:bg-white focus:ring-primary/15"
                                  value={field.value}
                                  onChange={field.onChange}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signupForm.control}
                        name="cpfCnpj"
                        render={({ field }) => {
                          const handleCpfCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, 14);
                            let formatted = '';
                            if (digits.length <= 11) {
                              // Format as CPF
                              if (digits.length <= 3) formatted = digits;
                              else if (digits.length <= 6) formatted = `${digits.slice(0, 3)}.${digits.slice(3)}`;
                              else if (digits.length <= 9) formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
                              else formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
                            } else {
                              // Format as CNPJ
                              if (digits.length <= 12) formatted = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
                              else formatted = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
                            }
                            field.onChange(formatted);
                          };
                          return (
                            <FormItem>
                              <FormLabel className="sr-only">CPF ou CNPJ (opcional)</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6680a7]/40" />
                                  <Input
                                    aria-label="CPF ou CNPJ (opcional)"
                                    placeholder="000.000.000-00"
                                    autoComplete="off"
                                    className="h-[50px] rounded-[14px] border-[#d8e5f7] bg-white/70 pl-11 text-[#10264e] placeholder:text-[#8297b7] focus:border-primary focus:bg-white focus:ring-primary/15"
                                    value={field.value}
                                    onChange={handleCpfCnpjChange}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                      <FormField
                        control={signupForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="sr-only">E-mail</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6680a7]/40" />
                                <Input aria-label="E-mail" type="email" placeholder="seu@email.com" autoComplete="email" className="h-[50px] rounded-[14px] border-[#d8e5f7] bg-white/70 pl-11 text-[#10264e] placeholder:text-[#8297b7] focus:border-primary focus:bg-white focus:ring-primary/15" {...field} />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signupForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="sr-only">Senha</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6680a7]/40" />
                                <Input aria-label="Senha" type={showPassword ? 'text' : 'password'} placeholder="••••••••" autoComplete="new-password" className="h-[50px] rounded-[14px] border-[#d8e5f7] bg-white/70 pl-11 pr-12 text-[#10264e] placeholder:text-[#8297b7] focus:border-primary focus:bg-white focus:ring-primary/15" {...field} />
                                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(!showPassword)}>
                                  {showPassword ? <EyeOff className="h-4 w-4 text-[#6680a7]" /> : <Eye className="h-4 w-4 text-[#6680a7]" />}
                                </Button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signupForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="sr-only">Confirmar senha</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6680a7]/40" />
                                <Input aria-label="Confirmar senha" type={showConfirmPassword ? 'text' : 'password'} placeholder="••••••••" autoComplete="new-password" className="h-[50px] rounded-[14px] border-[#d8e5f7] bg-white/70 pl-11 pr-12 text-[#10264e] placeholder:text-[#8297b7] focus:border-primary focus:bg-white focus:ring-primary/15" {...field} />
                                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" aria-label={showConfirmPassword ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'} onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                                  {showConfirmPassword ? <EyeOff className="h-4 w-4 text-[#6680a7]" /> : <Eye className="h-4 w-4 text-[#6680a7]" />}
                                </Button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        className="h-[52px] w-full rounded-[14px] bg-gradient-to-r from-[#0765e8] via-[#0878f9] to-[#278dff] text-sm font-bold text-white shadow-[0_12px_24px_-12px_rgba(0,103,235,0.7)] transition hover:brightness-105"
                        disabled={isLoading}
                      >
                        {isLoading ? <><Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />Criando…</> : urlCodigo ? 'Aceitar convite e criar conta' : 'Criar conta'}
                      </Button>
                      {!urlCodigo && (
                        <p className="text-center text-xs leading-relaxed text-[#6680a7]">
                          Ao criar sua conta, você concorda com os <Link to="/termos-uso" className="text-primary underline underline-offset-2">Termos de Uso</Link> e a <Link to="/politica-privacidade" className="text-primary underline underline-offset-2">Política de Privacidade</Link>.
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="h-[48px] w-full rounded-[14px] border-[#c7d9f1] bg-white/50 text-sm font-semibold text-primary hover:bg-white/90"
                        onClick={() => navigate('/#planos')}
                      >
                        <CreditCard className="mr-2 h-4 w-4" />
                        Assinar um Plano
                      </Button>
                    </form>
                  </Form>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-6 border-t border-[#d7e4f4] pt-5 text-center">
            <p className="flex items-center justify-center gap-2 text-xs font-medium text-[#52739d]">
              <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
              Acesso protegido para sua clínica
            </p>
            <p className="mt-1 text-[11px] text-[#7890b2]">Seus dados de acesso são tratados com cuidado.</p>
          </div>
        </motion.div>

        <aside className="hidden justify-self-end self-center text-[#58739f] xl:block">
          <div className="border-l border-[#8ba9d4]/60 py-1 pl-4"><span className="text-xs">01</span></div>
          <p className="mt-4 max-w-[135px] text-xs font-medium uppercase leading-relaxed tracking-[0.12em]">Sistema completo para clínicas</p>
          <div className="mt-5 flex gap-1.5" aria-hidden="true"><span className="h-1 w-5 rounded-full bg-primary" /><span className="h-1 w-5 rounded-full bg-[#b9cce5]" /><span className="h-1 w-5 rounded-full bg-[#b9cce5]" /></div>
        </aside>
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-[1680px] flex-col items-center justify-between gap-4 px-5 pb-5 text-[11px] text-[#6680a7] sm:flex-row sm:px-8 xl:px-14">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 sm:justify-start">
          <span className="inline-flex items-center gap-2"><Shield className="h-4 w-4" aria-hidden="true" />Acesso por perfil</span>
          <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" aria-hidden="true" />Agenda integrada</span>
          <span className="inline-flex items-center gap-2"><FlaskConical className="h-4 w-4" aria-hidden="true" />Gestão laboratorial</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-end">
          <Link to="/termos-uso" className="hover:text-primary">Termos de Uso</Link>
          <span aria-hidden="true">|</span>
          <Link to="/politica-privacidade" className="hover:text-primary">Privacidade</Link>
          <span aria-hidden="true">|</span>
          <span>© {new Date().getFullYear()} EloLab</span>
        </div>
      </footer>

      {pendingFactorId && (
        <MFAVerifyDialog
          open
          factorId={pendingFactorId}
          onVerified={handleMfaVerified}
          onCancel={handleMfaCancel}
        />
      )}
    </div>
  );
}
