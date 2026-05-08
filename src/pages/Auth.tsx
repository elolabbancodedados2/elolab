import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Loader2, Eye, EyeOff, Shield, ArrowLeft,
  Gift, CheckCircle2, Lock, Mail, User, Phone, FileText, CreditCard,
  Stethoscope, HeartPulse, MonitorSmartphone, UserCog,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { checkRateLimit, resetRateLimit, getRemainingAttempts } from '@/lib/rateLimiter';
import { AuthSwitch } from '@/components/ui/auth-switch';
import logoIcon from '@/assets/logo-elolab-icon.png';
import authHero from '@/assets/auth-hero.webp';

// ─── Schemas ───────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

const signupSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  telefone: z.string().min(14, 'Telefone inválido'),
  cpfCnpj: z.string().min(14, 'CPF ou CNPJ inválido'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  confirmPassword: z.string().min(1, 'Confirme a senha'),
  codigoConvite: z.string().min(1, 'Código de convite é obrigatório'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

type LoginForm = z.infer<typeof loginSchema>;
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
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [direction, setDirection] = useState(0);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const urlCodigo = searchParams.get('codigo') || '';
  const urlEmail = searchParams.get('email') || '';

  useEffect(() => {
    if (urlCodigo) { setActiveTab('signup'); setDirection(1); }
  }, [urlCodigo]);

  useEffect(() => {
    const host = window.location.hostname;
    if (host === 'elolab.com.br' || host === 'www.elolab.com.br') {
      const targetUrl = `https://app.elolab.com.br${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(targetUrl);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user && profile) navigate('/dashboard');
  }, [user, profile, authLoading, navigate]);

  const loginForm = useForm<LoginForm>({
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

  const handleTabChange = (tab: 'login' | 'signup') => {
    setDirection(tab === 'signup' ? 1 : -1);
    setActiveTab(tab);
  };

  const onLogin = async (data: LoginForm) => {
    const rateKey = `login:${data.email.toLowerCase()}`;
    const { allowed, retryAfterMs } = checkRateLimit(rateKey, 'auth');
    if (!allowed) {
      const minutes = Math.ceil(retryAfterMs / 60000);
      toast.error(`Muitas tentativas para este email. Tente novamente em ${minutes} min.`);
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await signIn(data.email, data.password);
      if (error) {
        const remaining = getRemainingAttempts(rateKey, 'auth');
        if (error.message.includes('Invalid login credentials')) {
          toast.error(
            remaining > 0
              ? `Email ou senha incorretos. ${remaining} tentativa${remaining === 1 ? '' : 's'} restante${remaining === 1 ? '' : 's'}.`
              : 'Email ou senha incorretos.'
          );
        } else if (error.message.includes('Email not confirmed')) {
          toast.error('Confirme seu email antes de fazer login');
        } else {
          toast.error(error.message || 'Erro ao fazer login');
        }
      } else {
        resetRateLimit(rateKey);
        toast.success('Login realizado!');
        navigate('/dashboard');
      }
    } catch {
      toast.error('Erro ao fazer login');
    } finally {
      setIsLoading(false);
    }
  };

  const activateSubscription = async (userId: string, codigoConvite: string) => {
    try {
      const { data: result, error: rpcError } = await supabase.rpc(
        'activate_public_registration' as any,
        { _user_id: userId, _codigo_convite: codigoConvite }
      );

      if (rpcError) {
        if (import.meta.env.DEV) console.error('Erro ao ativar registro:', rpcError);
        toast.error('Erro ao ativar sua assinatura. Tente fazer login novamente.');
        return;
      }

      const res = result as any;
      if (!res?.success) {
        toast.error(res?.error || 'Erro ao ativar assinatura.');
        return;
      }

      if (res.mode === 'paid') {
        toast.success(`Plano ${res.plano_nome} ativado! 🎉`);
      } else if (res.mode === 'trial') {
        toast.success(`Teste grátis ativado! ${res.plano_nome} por 3 dias. 🎉`);
      } else {
        toast.success(`Plano ${res.plano_nome} ativado!`);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Erro ao ativar assinatura:', err);
    }
  };

  const onSignup = async (data: SignupForm) => {
    const rateKey = `signup:${data.email.toLowerCase()}`;
    const { allowed, retryAfterMs } = checkRateLimit(rateKey, 'auth');
    if (!allowed) {
      const minutes = Math.ceil(retryAfterMs / 60000);
      toast.error(`Muitas tentativas. Tente novamente em ${minutes} min.`);
      return;
    }
    setIsLoading(true);
    try {
      // Validate invite code via secure RPC (bypasses RLS)
      const { data: validation, error: valError } = await supabase.rpc(
        'validate_invite_code' as any,
        { _codigo: data.codigoConvite }
      );

      if (valError) {
        toast.error('Erro ao validar código. Tente novamente.');
        setIsLoading(false);
        return;
      }

      const valResult = validation as any;
      if (!valResult?.valid) {
        toast.error(valResult?.error || 'Código de convite inválido ou já utilizado.');
        setIsLoading(false);
        return;
      }

      const result = await signUp(data.email, data.password, data.nome, data.telefone, data.cpfCnpj);
      if (result.error) {
        if (result.error.message.includes('User already registered')) toast.error('Este email já está cadastrado');
        else toast.error(result.error.message || 'Erro ao criar conta');
      } else {
        const userId = result.data?.user?.id;
        if (userId) await activateSubscription(userId, data.codigoConvite);
        setSignupSuccess(true);
        toast.success('Conta criada com sucesso!');
        signupForm.reset();
      }
    } catch {
      toast.error('Erro ao criar conta');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Loading state ───────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <img src={logoIcon} alt="EloLab" className="h-14 w-14 drop-shadow-lg" />
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </motion.div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className="min-h-screen flex bg-background">
      {/* ─── Left: Hero Image ─── */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        {/* Image */}
        <img
          src={authHero}
          alt="Médica usando tecnologia"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/10" />

        {/* Green accent glow */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary/80 to-transparent" />

        {/* Content overlay */}
        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-14 w-full">
          {/* Top logo */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                <img src={logoIcon} alt="EloLab" className="h-7 w-7 drop-shadow-lg" />
              </div>
              <span className="text-xl font-extrabold font-display tracking-tight text-white drop-shadow-md">
                EloLab
              </span>
            </div>
          </motion.div>

          {/* Bottom content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="max-w-lg"
          >
            <h1 className="text-3xl xl:text-4xl font-extrabold font-display text-white leading-tight mb-3 drop-shadow-lg">
              Gestão clínica
              <br />
              <span className="text-primary">inteligente e moderna</span>
            </h1>
            <p className="text-white/60 text-sm leading-relaxed mb-6 max-w-md">
              Prontuário eletrônico, agenda, financeiro e laboratório em uma única plataforma segura.
            </p>

            {/* Stats badges */}
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-white text-xs font-medium flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-primary" />
                LGPD Compliant
              </div>
              <div className="px-4 py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-white text-xs font-medium flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-primary" />
                Criptografia E2E
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ─── Right: Auth Form ─── */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-10 relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/[0.02] rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[420px] relative z-10"
        >
          {/* Mobile Logo */}
          <div className="text-center mb-8 lg:hidden">
            <div className="flex items-center justify-center gap-2.5 mb-2">
              <img src={logoIcon} alt="EloLab" className="h-10 w-10 drop-shadow-md" />
              <span className="text-2xl font-extrabold font-display tracking-tight text-foreground">
                Elo<span className="text-primary">Lab</span>
              </span>
            </div>
            <p className="text-muted-foreground text-sm">Gestão Clínica Inteligente</p>
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
                  <p className="text-sm font-semibold text-foreground">Código detectado!</p>
                  <p className="text-xs text-muted-foreground">Preencha seus dados para ativar.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Heading */}
          <div className="mb-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-2xl font-bold font-display text-foreground">
                  {activeTab === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}
                </h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {activeTab === 'login'
                    ? 'Acesse o sistema com suas credenciais'
                    : 'Preencha os dados para começar'}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Role info cards - only on login */}
          {activeTab === 'login' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.3 }}
              className="mb-5"
            >
              <p className="text-xs font-medium text-muted-foreground mb-2.5">Tipos de acesso disponíveis:</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: UserCog, label: 'Administrador', desc: 'Gestão total da clínica', color: 'text-red-600 bg-red-50 border-red-100' },
                  { icon: Stethoscope, label: 'Médico', desc: 'Prontuários e prescrições', color: 'text-blue-600 bg-blue-50 border-blue-100' },
                  { icon: HeartPulse, label: 'Enfermagem', desc: 'Triagem e procedimentos', color: 'text-purple-600 bg-purple-50 border-purple-100' },
                  { icon: MonitorSmartphone, label: 'Recepção', desc: 'Agenda e atendimento', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
                ].map((role) => (
                  <div
                    key={role.label}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border ${role.color} transition-all`}
                  >
                    <role.icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-tight">{role.label}</p>
                      <p className="text-[10px] opacity-70 leading-tight truncate">{role.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Seu acesso é definido pelo administrador da clínica
              </p>
            </motion.div>
          )}

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
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Email</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                              <Input
                                type="email"
                                placeholder="seu@email.com"
                                autoComplete="email"
                                className="h-11 pl-10 bg-muted/20 border-border/50 focus:border-primary focus:bg-card rounded-xl"
                                {...field}
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
                          <FormLabel className="text-sm font-medium">Senha</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                              <Input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                className="h-11 pl-10 pr-10 bg-muted/20 border-border/50 focus:border-primary focus:bg-card rounded-xl"
                                {...field}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword
                                  ? <EyeOff className="h-4 w-4 text-muted-foreground" />
                                  : <Eye className="h-4 w-4 text-muted-foreground" />}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full h-11 font-bold rounded-xl text-sm shadow-md shadow-primary/15 hover:shadow-lg hover:shadow-primary/25 transition-all"
                      disabled={isLoading}
                    >
                      {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando...</> : 'Entrar'}
                    </Button>
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
                        Conta criada e plano ativado! Faça login para acessar.
                      </AlertDescription>
                    </Alert>
                  </motion.div>
                ) : (
                  <Form {...signupForm}>
                    <form onSubmit={signupForm.handleSubmit(onSignup)} className="space-y-3.5">
                      <FormField
                        control={signupForm.control}
                        name="codigoConvite"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-primary flex items-center gap-1.5">
                              <Gift className="h-3.5 w-3.5" /> Código de Convite
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="A1B2C3D4"
                                autoComplete="off"
                                className="h-11 bg-primary/5 border-primary/20 focus:border-primary rounded-xl font-mono text-center text-base tracking-widest uppercase"
                                {...field}
                                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signupForm.control}
                        name="nome"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Nome completo</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                                <Input placeholder="Dr. João Silva" autoComplete="name" className="h-11 pl-10 bg-muted/20 border-border/50 focus:border-primary focus:bg-card rounded-xl" {...field} />
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
                            <FormLabel className="text-sm font-medium">Telefone</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                                <MaskedInput
                                  mask="phone"
                                  placeholder="(11) 99999-9999"
                                  autoComplete="tel"
                                  className="h-11 pl-10 bg-muted/20 border-border/50 focus:border-primary focus:bg-card rounded-xl"
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
                              <FormLabel className="text-sm font-medium">CPF ou CNPJ</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                                  <Input
                                    placeholder="000.000.000-00"
                                    autoComplete="off"
                                    className="h-11 pl-10 bg-muted/20 border-border/50 focus:border-primary focus:bg-card rounded-xl"
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
                            <FormLabel className="text-sm font-medium">Email</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                                <Input type="email" placeholder="seu@email.com" autoComplete="email" className="h-11 pl-10 bg-muted/20 border-border/50 focus:border-primary focus:bg-card rounded-xl" {...field} />
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
                            <FormLabel className="text-sm font-medium">Senha</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                                <Input type={showPassword ? 'text' : 'password'} placeholder="••••••••" autoComplete="new-password" className="h-11 pl-10 pr-10 bg-muted/20 border-border/50 focus:border-primary focus:bg-card rounded-xl" {...field} />
                                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
                                  {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
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
                            <FormLabel className="text-sm font-medium">Confirmar senha</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                                <Input type={showConfirmPassword ? 'text' : 'password'} placeholder="••••••••" autoComplete="new-password" className="h-11 pl-10 pr-10 bg-muted/20 border-border/50 focus:border-primary focus:bg-card rounded-xl" {...field} />
                                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                                  {showConfirmPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                                </Button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        className="w-full h-11 font-bold rounded-xl text-sm shadow-md shadow-primary/15 hover:shadow-lg hover:shadow-primary/25 transition-all"
                        disabled={isLoading}
                      >
                        {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando...</> : 'Criar conta e ativar'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full h-11 font-bold rounded-xl text-sm border-primary/30 text-primary hover:bg-primary/5 transition-all"
                        onClick={() => navigate('/#planos')}
                      >
                        <CreditCard className="mr-2 h-4 w-4" />
                        Assinar um Plano
                      </Button>
                    </form>
                  </Form>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer */}
          <div className="mt-8 space-y-3">
            <a
              href="https://app.elolab.com.br"
              className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar ao site
            </a>
            <p className="text-center text-[11px] text-muted-foreground/60">
              © {new Date().getFullYear()} EloLab · Todos os direitos reservados
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
