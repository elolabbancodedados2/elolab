import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Calendar, FlaskConical, CreditCard, User, ExternalLink, Lock,
  Star, MessageSquare, CheckCircle2, HeartHandshake, Clock,
  Activity, FileText, Phone, Shield, Sparkles, ChevronRight,
  Heart, Pill, AlertTriangle, Download, RefreshCw,
  LogOut,
} from 'lucide-react';
import { format, isPast, isToday, isFuture, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { todayDateOnly } from '@/lib/dateOnly';
import { abrirUrlSegura, checkoutUrlSeguro, storageUrlSeguro } from '@/lib/safeUrl';

// ─── Status helpers ────────────────────────────────────────
const statusConfig: Record<string, { bg: string; label: string }> = {
  agendado: { bg: 'bg-blue-500/10 text-blue-700 border-blue-200', label: 'Agendado' },
  confirmado: { bg: 'bg-green-500/10 text-green-700 border-green-200', label: 'Confirmado' },
  finalizado: { bg: 'bg-muted text-muted-foreground', label: 'Finalizado' },
  cancelado: { bg: 'bg-destructive/10 text-destructive', label: 'Cancelado' },
  faltou: { bg: 'bg-destructive/10 text-destructive', label: 'Faltou' },
  aprovado: { bg: 'bg-green-500/10 text-green-700', label: 'Aprovado' },
  pendente: { bg: 'bg-amber-500/10 text-amber-700', label: 'Pendente' },
  solicitado: { bg: 'bg-blue-500/10 text-blue-700', label: 'Solicitado' },
  laudo_disponivel: { bg: 'bg-green-500/10 text-green-700', label: 'Laudo Disponível' },
  em_andamento: { bg: 'bg-blue-500/10 text-blue-700', label: 'Em Andamento' },
  pago: { bg: 'bg-green-500/10 text-green-700', label: 'Pago' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || { bg: 'bg-muted text-muted-foreground', label: status };
  return <Badge variant="outline" className={`text-[11px] ${cfg.bg}`}>{cfg.label}</Badge>;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function calcularIdade(dn: string | null) {
  if (!dn) return null;
  const hoje = new Date(), nasc = new Date(dn);
  let i = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) i--;
  return i;
}

// ─── Animated counter ──────────────────────────────────────
function AnimatedNumber({ value }: { value: number }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="tabular-nums font-bold text-2xl"
    >
      {value}
    </motion.span>
  );
}

// ─── Login Screen ──────────────────────────────────────────
function LoginScreen({ token, setToken, onLogin, loading, error }: {
  token: string; setToken: (v: string) => void;
  onLogin: () => void; loading: boolean; error: string;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10" />
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-primary/5 blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-primary/8 blur-3xl translate-y-1/2 -translate-x-1/2" />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="backdrop-blur-xl border-border/50 shadow-xl">
          <CardHeader className="text-center pb-2">
            {/* Animated logo ring */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="mx-auto mb-4 relative"
            >
              <div className="p-5 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                <HeartHandshake className="h-10 w-10 text-primary" />
              </div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-2xl border-2 border-dashed border-primary/20"
              />
            </motion.div>

            <CardTitle className="text-2xl font-display">Portal do Paciente</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Acesse seu histórico, consultas e exames
            </p>
          </CardHeader>

          <CardContent className="space-y-4 pt-2">
            <div className="space-y-2">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Digite seu código de acesso"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onLogin()}
                  className="pl-10 h-12 text-base"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Código fornecido pela clínica EloLab
              </p>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <Button
              className="w-full h-12 text-base gap-2"
              variant="premium"
              onClick={onLogin}
              disabled={loading || !token.trim()}
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loading ? 'Verificando...' : 'Acessar Portal'}
            </Button>

            <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground pt-2">
              <Shield className="h-3.5 w-3.5" />
              <span>Acesso seguro — Dados protegidos pela LGPD</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ─── Next Appointment Hero ─────────────────────────────────
function NextAppointmentHero({ agendamentos }: { agendamentos: any[] }) {
  const proxima = agendamentos.find(a =>
    (a.status === 'agendado' || a.status === 'confirmado') &&
    (isToday(parseISO(a.data)) || isFuture(parseISO(a.data)))
  );

  if (!proxima) return null;

  const dataConsulta = parseISO(proxima.data);
  const diasRestantes = differenceInDays(dataConsulta, new Date());
  const isHoje = isToday(dataConsulta);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <Card className="overflow-hidden border-primary/30 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-primary/20">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-semibold text-primary uppercase tracking-wide">
              Próxima Consulta
            </span>
            {isHoje && (
              <Badge className="bg-primary text-primary-foreground text-[10px] animate-pulse">HOJE</Badge>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-lg font-bold">
                {format(dataConsulta, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </p>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {proxima.hora_inicio?.slice(0, 5)}
                </span>
                <span>{proxima.tipo || 'Consulta'}</span>
                {proxima.medicos?.nome && (
                  <span>Dr(a). {proxima.medicos.nome}</span>
                )}
              </div>
            </div>

            {!isHoje && diasRestantes > 0 && (
              <div className="text-center px-4 py-2 rounded-xl bg-primary/10">
                <p className="text-2xl font-bold text-primary tabular-nums">{diasRestantes}</p>
                <p className="text-[10px] text-muted-foreground uppercase">dia{diasRestantes > 1 ? 's' : ''}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── NPS Survey ────────────────────────────────────────────
function NPSSurvey({ token }: { token: string }) {
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSubmit = async () => {
    if (nota === null) return;
    setSending(true);
    setSubmitError('');
    try {
      const { data, error } = await supabase.functions.invoke('patient-portal', {
        body: { action: 'submit_feedback', token, nota, comentario },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Não foi possível enviar');
      setSent(true);
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <Card className="text-center p-8 border-primary/20 bg-primary/5">
          <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-3" />
          <h3 className="text-lg font-bold">Obrigado pelo feedback!</h3>
          <p className="text-sm text-muted-foreground mt-1">Sua opinião nos ajuda a melhorar.</p>
        </Card>
      </motion.div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Como foi sua experiência?</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <motion.button
              key={n}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setNota(n)}
              className={`w-9 h-9 rounded-lg text-sm font-semibold transition-all ${
                nota === n
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : nota !== null && n <= nota
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {n}
            </motion.button>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground px-1">
          <span>Nada provável</span>
          <span>Muito provável</span>
        </div>

        <AnimatePresence>
          {nota !== null && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-3"
            >
              <Textarea
                placeholder="Conte-nos mais sobre sua experiência (opcional)..."
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                rows={2}
                className="text-sm"
              />
              {submitError && <p className="text-xs text-destructive" role="alert">{submitError}</p>}
              <Button onClick={handleSubmit} disabled={sending} className="w-full gap-2" size="sm">
                <Star className="h-3.5 w-3.5" />
                {sending ? 'Enviando...' : 'Enviar Avaliação'}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

// ─── Main Portal ───────────────────────────────────────────
export default function PortalPaciente() {
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get('token') || '');
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [agendamentos, setAgendamentos] = useState<any[]>([]);
  const [exames, setExames] = useState<any[]>([]);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [prescricoes, setPrescricoes] = useState<any[]>([]);
  const [retornos, setRetornos] = useState<any[]>([]);
  const [ofertasEspera, setOfertasEspera] = useState<any[]>([]);
  const [contactForm, setContactForm] = useState({ telefone: '', email: '' });
  const [contactSaving, setContactSaving] = useState(false);
  const [contactMessage, setContactMessage] = useState('');

  // Scheduling form state
  const [medicos, setMedicos] = useState<any[]>([]);
  const [schedulingForm, setSchedulingForm] = useState({
    medico_id: '',
    data: '',
    hora_inicio: '',
    tipo: 'Consulta',
  });
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [schedulingLoading, setSchedulingLoading] = useState(false);
  const [schedulingError, setSchedulingError] = useState('');

  // Reschedule/cancel state
  const [rescheduleModal, setRescheduleModal] = useState<any>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ data: '', hora_inicio: '' });
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async (accessToken: string, action: string, bodyData?: any) => {
    const { data, error } = await supabase.functions.invoke('patient-portal', {
      body: { action, token: accessToken, ...bodyData },
    });
    if (error) throw error;
    return data;
  };

  const handleLogin = async () => {
    if (!token.trim()) return;
    setLoading(true);
    setError('');

    try {
      const profileData = await fetchData(token, 'get_profile');
      if (!profileData || profileData.error) {
        setError(profileData?.error || 'Token inválido ou expirado');
        return;
      }
      setProfile(profileData);
      setContactForm({ telefone: profileData.telefone || '', email: profileData.email || '' });
      setAuthenticated(true);

      const [ag, ex, pg, presc, docs, rets, ofertas] = await Promise.all([
        fetchData(token, 'get_agendamentos'),
        fetchData(token, 'get_exames'),
        fetchData(token, 'get_pagamentos'),
        fetchData(token, 'get_prescricoes').catch(() => []),
        fetchData(token, 'get_medicos'),
        fetchData(token, 'get_retornos').catch(() => []),
        fetchData(token, 'get_waitlist_offers').catch(() => []),
      ]);
      setAgendamentos(ag || []);
      setExames(ex || []);
      setPagamentos(pg || []);
      setPrescricoes(presc || []);
      setMedicos(docs || []);
      setRetornos(rets || []);
      setOfertasEspera(ofertas || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao acessar portal');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableSlots = async (medico_id: string, data: string) => {
    if (!medico_id || !data || !token) return;
    try {
      setSchedulingLoading(true);
      setSchedulingError('');
      const slots = await fetchData(token, 'get_available_slots', {
        medico_id,
        data_inicio: data,
        data_fim: data,
      });
      setAvailableSlots(slots || []);
      setSchedulingForm(f => ({ ...f, hora_inicio: '' }));
    } catch (err: any) {
      setSchedulingError(err.message || 'Erro ao carregar horários disponíveis');
    } finally {
      setSchedulingLoading(false);
    }
  };

  const handleCreateAgendamento = async () => {
    if (!schedulingForm.medico_id || !schedulingForm.data || !schedulingForm.hora_inicio) {
      setSchedulingError('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    try {
      setSchedulingLoading(true);
      setSchedulingError('');
      const result = await fetchData(token, 'create_agendamento', {
        medico_id: schedulingForm.medico_id,
        data: schedulingForm.data,
        hora_inicio: schedulingForm.hora_inicio,
        tipo: schedulingForm.tipo,
      });

      if (result?.success) {
        // Reload agendamentos to show the new one
        const updatedAgendamentos = await fetchData(token, 'get_agendamentos');
        setAgendamentos(updatedAgendamentos || []);
        setSchedulingForm({ medico_id: '', data: '', hora_inicio: '', tipo: 'Consulta' });
        setAvailableSlots([]);
      }
    } catch (err: any) {
      setSchedulingError(err.message || 'Erro ao agendar consulta');
    } finally {
      setSchedulingLoading(false);
    }
  };

  const handleCancelAppointment = async (agendamento_id: string) => {
    try {
      setActionLoading(true);
      await fetchData(token, 'cancel_agendamento', {
        agendamento_id,
        motivo: cancelMotivo || 'Cancelado pelo paciente',
      });
      // Reload agendamentos
      const updatedAgendamentos = await fetchData(token, 'get_agendamentos');
      setAgendamentos(updatedAgendamentos || []);
      setCancelMotivo('');
    } catch (err: any) {
      console.error('Erro ao cancelar:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthenticated(false);
    setToken('');
    setProfile(null);
    setAgendamentos([]);
    setExames([]);
    setPagamentos([]);
    setPrescricoes([]);
    setRetornos([]);
    setOfertasEspera([]);
    setError('');
  };

  const handleUpdateContact = async () => {
    setContactSaving(true);
    setContactMessage('');
    try {
      const response = await fetchData(token, 'update_contact', contactForm);
      if (response?.error) throw new Error(response.error);
      setProfile(response.profile);
      setContactMessage('Dados de contato atualizados.');
    } catch (err: any) {
      setContactMessage(err.message || 'Não foi possível atualizar seus dados.');
    } finally {
      setContactSaving(false);
    }
  };

  const handleConfirmAppointment = async (agendamento_id: string) => {
    try {
      setActionLoading(true);
      await fetchData(token, 'confirm_agendamento', { agendamento_id });
      setAgendamentos(await fetchData(token, 'get_agendamentos'));
    } catch (err: any) {
      setError(err.message || 'Erro ao confirmar consulta');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRescheduleAppointment = async () => {
    if (!rescheduleForm.data || !rescheduleForm.hora_inicio || !rescheduleModal) {
      return;
    }

    try {
      setActionLoading(true);
      await fetchData(token, 'reschedule_agendamento', {
        agendamento_id: rescheduleModal.id,
        nova_data: rescheduleForm.data,
        novo_horario: rescheduleForm.hora_inicio,
      });
      // Reload agendamentos
      const updatedAgendamentos = await fetchData(token, 'get_agendamentos');
      setAgendamentos(updatedAgendamentos || []);
      setRescheduleModal(null);
      setRescheduleForm({ data: '', hora_inicio: '' });
    } catch (err: any) {
      console.error('Erro ao remarcar:', err);
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken) {
      // O link pode chegar por e-mail/WhatsApp, mas o segredo não deve
      // permanecer no histórico, em screenshots ou no Referer de navegação.
      // O estado React mantém o token apenas em memória durante esta sessão.
      const sanitizedUrl = new URL(window.location.href);
      sanitizedUrl.searchParams.delete('token');
      window.history.replaceState({}, '', `${sanitizedUrl.pathname}${sanitizedUrl.search}${sanitizedUrl.hash}`);
      setToken(urlToken);
      handleLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount when URL has token
  }, []);

  // ─── Login ────────────────────────────────────────────────
  if (!authenticated) {
    return <LoginScreen token={token} setToken={setToken} onLogin={handleLogin} loading={loading} error={error} />;
  }

  // Stats
  const totalConsultas = agendamentos.length;
  const consultasFuturas = agendamentos.filter(a => (a.status === 'agendado' || a.status === 'confirmado')).length;
  const examesPendentes = exames.filter(e => e.status === 'solicitado' || e.status === 'em_andamento').length;
  const laudosDisponiveis = exames.filter(e => e.status === 'laudo_disponivel').length;
  const idade = calcularIdade(profile?.data_nascimento);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-xl px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <HeartHandshake className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-display text-foreground">EloLab</h1>
              <p className="text-[11px] text-muted-foreground -mt-0.5">Portal do Paciente</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold">{profile?.nome}</p>
              <p className="text-[11px] text-muted-foreground">
                {idade && `${idade} anos`}
                {profile?.cpf && ` • CPF: ***${profile.cpf.slice(-5)}`}
              </p>
            </div>
            <div className="p-2 rounded-full bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2" aria-label="Sair do portal do paciente">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >
          {/* ─── Welcome Hero ─── */}
          <motion.div variants={itemVariants} className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-bold font-display">
              Olá, {profile?.nome?.split(' ')[0]} 👋
            </h2>
            <p className="text-muted-foreground">
              Acompanhe suas consultas, exames e pagamentos.
            </p>
          </motion.div>

          {/* ─── Next Appointment ─── */}
          <motion.div variants={itemVariants}>
            <NextAppointmentHero agendamentos={agendamentos} />
          </motion.div>

          {/* ─── KPI Stats ─── */}
          <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: Calendar, label: 'Consultas', value: totalConsultas, accent: 'text-blue-600 bg-blue-500/10' },
              { icon: Clock, label: 'Agendadas', value: consultasFuturas, accent: 'text-primary bg-primary/10' },
              { icon: FlaskConical, label: 'Exames Pendentes', value: examesPendentes, accent: 'text-amber-600 bg-amber-500/10' },
              { icon: FileText, label: 'Laudos Prontos', value: laudosDisponiveis, accent: 'text-green-600 bg-green-500/10' },
            ].map(stat => (
              <Card key={stat.label} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${stat.accent}`}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <AnimatedNumber value={stat.value} />
                    <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </motion.div>

          {/* ─── Allergy alert ─── */}
          {profile?.alergias && profile.alergias.length > 0 && (
            <motion.div variants={itemVariants}>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                <span className="text-sm font-medium text-destructive">
                  Alergias: {profile.alergias.join(', ')}
                </span>
              </div>
            </motion.div>
          )}

          {/* ─── Tabs ─── */}
          <motion.div variants={itemVariants}>
            <Tabs defaultValue="consultas" className="w-full">
              <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto sm:h-12">
                <TabsTrigger value="agendar" className="gap-1.5 data-[state=active]:bg-primary/10">
                  <span className="text-lg">+</span>
                  <span className="hidden sm:inline text-sm">Agendar</span>
                </TabsTrigger>
                <TabsTrigger value="consultas" className="gap-1.5 data-[state=active]:bg-primary/10">
                  <Calendar className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm">Consultas</span>
                </TabsTrigger>
                <TabsTrigger value="exames" className="gap-1.5 data-[state=active]:bg-primary/10">
                  <FlaskConical className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm">Exames</span>
                </TabsTrigger>
                <TabsTrigger value="prescricoes" className="gap-1.5 data-[state=active]:bg-primary/10">
                  <Pill className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm">Receitas</span>
                </TabsTrigger>
                <TabsTrigger value="historico" className="gap-1.5 data-[state=active]:bg-primary/10">
                  <Heart className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm">Histórico</span>
                </TabsTrigger>
                <TabsTrigger value="financeiro" className="gap-1.5 data-[state=active]:bg-primary/10">
                  <CreditCard className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm">Financeiro</span>
                </TabsTrigger>
              </TabsList>

              {/* ─── Agendar Tab ─── */}
              <TabsContent value="agendar" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      Agende uma Consulta
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">Escolha um médico, data e horário disponível</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {schedulingError && (
                      <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        {schedulingError}
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Médico *</label>
                      <select
                        value={schedulingForm.medico_id}
                        onChange={(e) => {
                          setSchedulingForm(f => ({ ...f, medico_id: e.target.value, hora_inicio: '' }));
                          setAvailableSlots([]);
                        }}
                        className="w-full px-3 py-2 border rounded-lg bg-background text-foreground"
                      >
                        <option value="">Selecione um médico</option>
                        {medicos.map(m => (
                          <option key={m.id} value={m.id}>
                            Dr(a). {m.nome} {m.especialidade && `— ${m.especialidade}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Data *</label>
                      <input
                        type="date"
                        value={schedulingForm.data}
                        onChange={(e) => {
                          setSchedulingForm(f => ({ ...f, data: e.target.value, hora_inicio: '' }));
                          if (e.target.value && schedulingForm.medico_id) {
                            loadAvailableSlots(schedulingForm.medico_id, e.target.value);
                          }
                        }}
                        min={todayDateOnly()}
                        className="w-full px-3 py-2 border rounded-lg bg-background text-foreground"
                      />
                    </div>

                    {schedulingForm.data && schedulingForm.medico_id && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Horário Disponível *</label>
                        {schedulingLoading ? (
                          <div className="text-center py-6 text-muted-foreground">
                            <div className="inline-block h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : availableSlots.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {availableSlots.map(slot => (
                              <button
                                key={slot}
                                onClick={() => setSchedulingForm(f => ({ ...f, hora_inicio: slot }))}
                                className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                                  schedulingForm.hora_inicio === slot
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted hover:bg-muted/80 text-foreground'
                                }`}
                              >
                                {slot}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground py-4 text-center">
                            Nenhum horário disponível nesta data
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tipo de Consulta</label>
                      <input
                        type="text"
                        value={schedulingForm.tipo}
                        onChange={(e) => setSchedulingForm(f => ({ ...f, tipo: e.target.value }))}
                        placeholder="Ex: Consulta, Check-up"
                        className="w-full px-3 py-2 border rounded-lg bg-background text-foreground"
                      />
                    </div>

                    <Button
                      onClick={handleCreateAgendamento}
                      disabled={!schedulingForm.medico_id || !schedulingForm.data || !schedulingForm.hora_inicio || schedulingLoading}
                      className="w-full gap-2"
                    >
                      <Calendar className="h-4 w-4" />
                      {schedulingLoading ? 'Agendando...' : 'Confirmar Agendamento'}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ─── Consultas Tab ─── */}
              <TabsContent value="consultas" className="mt-4 space-y-3">
                {!agendamentos.length ? (
                  <EmptyState icon={Calendar} text="Nenhuma consulta encontrada" />
                ) : (
                  agendamentos.map((a: any, i: number) => {
                    const dataAg = parseISO(a.data);
                    const passado = isPast(dataAg) && !isToday(dataAg);
                    return (
                      <motion.div
                        key={a.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <Card className={`transition-all hover:shadow-md ${passado ? 'opacity-60' : ''}`}>
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-start gap-3 flex-1">
                                  <div className={`p-2.5 rounded-xl ${isToday(dataAg) ? 'bg-primary/20' : 'bg-muted'}`}>
                                    <Calendar className={`h-4 w-4 ${isToday(dataAg) ? 'text-primary' : 'text-muted-foreground'}`} />
                                  </div>
                                  <div className="space-y-0.5">
                                    <p className="font-semibold text-sm">
                                      {a.tipo || 'Consulta'}
                                      {isToday(dataAg) && <Badge className="ml-2 bg-primary text-primary-foreground text-[9px]">HOJE</Badge>}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {format(dataAg, "dd 'de' MMM, yyyy", { locale: ptBR })}
                                      {a.hora_inicio && ` às ${a.hora_inicio.slice(0, 5)}`}
                                    </p>
                                    {a.medicos?.nome && (
                                      <p className="text-xs text-muted-foreground">
                                        Dr(a). {a.medicos.nome}
                                        {a.medicos.especialidade && ` — ${a.medicos.especialidade}`}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <StatusBadge status={a.status} />
                              </div>

                              {/* Action buttons for future appointments */}
                              {!passado && a.status !== 'cancelado' && (
                                <div className="flex gap-2 pt-2 border-t">
                                  {!['confirmado', 'em_atendimento', 'finalizado'].includes(a.status) && (
                                    <Button size="sm" onClick={() => handleConfirmAppointment(a.id)} disabled={actionLoading} className="flex-1 text-xs">
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirmar
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setRescheduleModal(a);
                                      setRescheduleForm({ data: a.data, hora_inicio: a.hora_inicio });
                                    }}
                                    disabled={actionLoading}
                                    className="flex-1 text-xs"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                                    Remarcar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      if (window.confirm('Deseja cancelar esta consulta?')) {
                                        handleCancelAppointment(a.id);
                                      }
                                    }}
                                    disabled={actionLoading}
                                    className="flex-1 text-xs text-destructive hover:text-destructive"
                                  >
                                    ✕ Cancelar
                                  </Button>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })
                )}
              </TabsContent>

              {/* ─── Exames Tab ─── */}
              <TabsContent value="exames" className="mt-4 space-y-3">
                {!exames.length ? (
                  <EmptyState icon={FlaskConical} text="Nenhum exame encontrado" />
                ) : (
                  exames.map((e: any, i: number) => {
                    const isLaudo = e.status === 'laudo_disponivel';
                    return (
                      <motion.div
                        key={e.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <Card className={`transition-all hover:shadow-md ${isLaudo ? 'border-green-300' : ''}`}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-start gap-3">
                                <div className={`p-2.5 rounded-xl ${isLaudo ? 'bg-green-500/10' : 'bg-muted'}`}>
                                  <FlaskConical className={`h-4 w-4 ${isLaudo ? 'text-green-600' : 'text-muted-foreground'}`} />
                                </div>
                                <div className="space-y-0.5">
                                  <p className="font-semibold text-sm flex items-center gap-2">
                                    {e.tipo_exame}
                                    {isLaudo && (
                                      <Badge className="bg-green-500/10 text-green-700 text-[9px] border-green-200">
                                        ✓ Laudo pronto
                                      </Badge>
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Solicitado: {e.data_solicitacao ? format(parseISO(e.data_solicitacao), 'dd/MM/yyyy') : 'N/A'}
                                    {e.data_realizacao && ` • Realizado: ${format(parseISO(e.data_realizacao), 'dd/MM/yyyy')}`}
                                  </p>
                                  {e.resultado && (
                                    <p className="text-xs text-foreground mt-1 bg-muted/50 px-2 py-1 rounded">
                                      {e.resultado.length > 120 ? e.resultado.slice(0, 120) + '...' : e.resultado}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <StatusBadge status={e.status} />
                                {e.arquivo_resultado && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1 text-xs"
                                    onClick={() => abrirUrlSegura(e.arquivo_resultado, storageUrlSeguro)}
                                  >
                                    <Download className="h-3 w-3" />
                                    PDF
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })
                )}
              </TabsContent>

              {/* ─── Prescrições Tab ─── */}
              <TabsContent value="prescricoes" className="mt-4 space-y-3">
                {!prescricoes.length ? (
                  <EmptyState icon={Pill} text="Nenhuma prescrição encontrada" />
                ) : (
                  prescricoes.map((p: any, i: number) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Card className="transition-all hover:shadow-md">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-xl bg-primary/10">
                              <Pill className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1 space-y-1">
                              <p className="font-semibold text-sm">{p.medicamento}</p>
                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                {p.dosagem && <span>Dose: {p.dosagem}</span>}
                                {p.posologia && <span>• {p.posologia}</span>}
                                {p.quantidade && <span>• Qtd: {p.quantidade}</span>}
                                {p.duracao && <span>• {p.duracao}</span>}
                              </div>
                              {p.observacoes && (
                                <p className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded mt-1">{p.observacoes}</p>
                              )}
                              <p className="text-[11px] text-muted-foreground">
                                {p.data_emissao ? format(parseISO(p.data_emissao), 'dd/MM/yyyy') : ''}
                                {p.medicos?.nome && ` — Dr(a). ${p.medicos.nome}`}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-[10px]">
                              {p.tipo === 'controle_especial' ? 'Especial' : p.tipo === 'antimicrobiano' ? 'Antimicro' : 'Simples'}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))
                )}
              </TabsContent>

              {/* ─── Histórico Médico Tab ─── */}
              <TabsContent value="historico" className="mt-4 space-y-3">
                {/* Alergias */}
                {profile?.alergias && profile.alergias.length > 0 && (
                  <Card className="border-destructive/20 bg-destructive/5">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        <span className="text-sm font-semibold text-destructive">Alergias Conhecidas</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {profile.alergias.map((a: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-destructive border-destructive/30 text-xs">{a}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Solicitar agendamento */}
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/20">
                          <Calendar className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Precisa agendar uma consulta?</p>
                          <p className="text-xs text-muted-foreground">Entre em contato com a clínica</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => {
                          const msg = encodeURIComponent(`Olá! Sou ${profile?.nome}, gostaria de agendar uma consulta.`);
                          window.open(`https://wa.me/?text=${msg}`, '_blank');
                        }}
                      >
                        <Phone className="h-3.5 w-3.5" />
                        WhatsApp
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Dados do paciente */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">Dados Pessoais</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {profile?.nome && (
                        <div><span className="text-muted-foreground text-xs">Nome</span><p className="font-medium">{profile.nome}</p></div>
                      )}
                      {profile?.data_nascimento && (
                        <div><span className="text-muted-foreground text-xs">Data de Nascimento</span><p className="font-medium">{format(parseISO(profile.data_nascimento), 'dd/MM/yyyy')}</p></div>
                      )}
                      {profile?.sexo && (
                        <div><span className="text-muted-foreground text-xs">Sexo</span><p className="font-medium capitalize">{profile.sexo}</p></div>
                      )}
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      <div><p className="text-xs font-medium">Atualize seus contatos</p><p className="text-[11px] text-muted-foreground">A clínica usará estes dados para confirmações e avisos.</p></div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div><label htmlFor="portal-telefone" className="text-xs text-muted-foreground">Telefone</label><Input id="portal-telefone" inputMode="tel" value={contactForm.telefone} onChange={e => setContactForm(form => ({ ...form, telefone: e.target.value }))} placeholder="(11) 99999-9999" /></div>
                        <div><label htmlFor="portal-email" className="text-xs text-muted-foreground">E-mail</label><Input id="portal-email" type="email" value={contactForm.email} onChange={e => setContactForm(form => ({ ...form, email: e.target.value }))} placeholder="voce@exemplo.com" /></div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button size="sm" onClick={handleUpdateContact} disabled={contactSaving}>{contactSaving ? <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}Salvar contatos</Button>
                        {contactMessage && <span className="text-xs text-muted-foreground" role="status">{contactMessage}</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Resumo de saúde */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Activity className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">Resumo de Saúde</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="text-center p-3 rounded-xl bg-muted/50">
                        <p className="text-2xl font-bold text-primary tabular-nums">{agendamentos.length}</p>
                        <p className="text-[10px] text-muted-foreground">Total Consultas</p>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-muted/50">
                        <p className="text-2xl font-bold text-primary tabular-nums">{exames.length}</p>
                        <p className="text-[10px] text-muted-foreground">Exames Realizados</p>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-muted/50">
                        <p className="text-2xl font-bold text-primary tabular-nums">
                          {exames.filter(e => e.status === 'laudo_disponivel').length}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Laudos Prontos</p>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-muted/50">
                        <p className="text-2xl font-bold text-primary tabular-nums">
                          {agendamentos.filter(a => a.status === 'finalizado').length}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Atendimentos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Prescrições recentes - from agendamentos finalizados */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Pill className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">Últimas Consultas Finalizadas</span>
                    </div>
                    {agendamentos.filter(a => a.status === 'finalizado').length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma consulta finalizada ainda</p>
                    ) : (
                      <div className="space-y-2">
                        {agendamentos
                          .filter(a => a.status === 'finalizado')
                          .slice(0, 5)
                          .map((a: any) => (
                            <div key={a.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                <div>
                                  <p className="font-medium">{a.tipo || 'Consulta'}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {format(parseISO(a.data), "dd/MM/yyyy")}
                                    {a.medicos?.nome && ` — Dr(a). ${a.medicos.nome}`}
                                  </p>
                                </div>
                              </div>
                              <StatusBadge status="finalizado" />
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* LGPD notice */}
                <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 text-xs text-muted-foreground">
                  <Shield className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>Seus dados médicos são armazenados com segurança e protegidos pela LGPD (Lei Geral de Proteção de Dados).</span>
                </div>
              </TabsContent>

              {/* ─── Financeiro Tab ─── */}
              <TabsContent value="financeiro" className="mt-4 space-y-3">
                {!pagamentos.length ? (
                  <EmptyState icon={CreditCard} text="Nenhum pagamento encontrado" />
                ) : (
                  pagamentos.map((p: any, i: number) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Card className="transition-all hover:shadow-md">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-start gap-3">
                              <div className={`p-2.5 rounded-xl ${p.status === 'pago' || p.status === 'aprovado' ? 'bg-green-500/10' : 'bg-amber-500/10'}`}>
                                <CreditCard className={`h-4 w-4 ${p.status === 'pago' || p.status === 'aprovado' ? 'text-green-600' : 'text-amber-600'}`} />
                              </div>
                              <div className="space-y-0.5">
                                <p className="font-semibold text-sm">{p.descricao || 'Pagamento'}</p>
                                <p className="text-xs text-muted-foreground">
                                  {p.created_at ? format(new Date(p.created_at), "dd 'de' MMM, yyyy", { locale: ptBR }) : ''}
                                  {p.metodo_pagamento && ` • ${p.metodo_pagamento}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="font-bold tabular-nums">{formatCurrency(p.valor)}</p>
                                <StatusBadge status={p.status} />
                              </div>
                              {p.checkout_url && p.status === 'pendente' && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="gap-1.5"
                                  onClick={() => abrirUrlSegura(p.checkout_url, checkoutUrlSeguro)}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Pagar
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </motion.div>

          {/* ─── Reschedule Modal ─── */}
          <AnimatePresence>
            {rescheduleModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
                onClick={() => setRescheduleModal(null)}
              >
                <motion.div
                  initial={{ scale: 0.95, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 20 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-card rounded-xl border p-6 max-w-sm w-full space-y-4 shadow-lg"
                >
                  <div>
                    <h3 className="font-semibold text-lg">Remarcar Consulta</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Médico: Dr(a). {rescheduleModal.medicos?.nome}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Nova Data *</label>
                      <input
                        type="date"
                        value={rescheduleForm.data}
                        onChange={(e) => setRescheduleForm(f => ({ ...f, data: e.target.value }))}
                        min={todayDateOnly()}
                        className="w-full px-3 py-2 border rounded-lg bg-background text-foreground"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Novo Horário *</label>
                      <input
                        type="time"
                        value={rescheduleForm.hora_inicio}
                        onChange={(e) => setRescheduleForm(f => ({ ...f, hora_inicio: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg bg-background text-foreground"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      onClick={() => setRescheduleModal(null)}
                      disabled={actionLoading}
                      className="flex-1"
                    >
                      Voltar
                    </Button>
                    <Button
                      onClick={handleRescheduleAppointment}
                      disabled={!rescheduleForm.data || !rescheduleForm.hora_inicio || actionLoading}
                      className="flex-1"
                    >
                      {actionLoading ? 'Remarcando...' : 'Confirmar'}
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ─── NPS Survey ─── */}
          {ofertasEspera.length > 0 && (
            <motion.div variants={itemVariants}>
              <Card className="border-primary/40 bg-primary/5">
                <CardHeader><CardTitle className="text-base">Vaga disponível para você</CardTitle><CardDescription>A reserva expira automaticamente; confirme para garantir o horário.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {ofertasEspera.map(oferta => (
                    <div key={oferta.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
                      <div><p className="font-medium">{format(new Date(`${oferta.vaga.data}T12:00:00`), 'dd/MM/yyyy')} às {oferta.vaga.hora_inicio?.slice(0, 5)}</p>
                        <p className="text-xs text-muted-foreground">Dr(a). {oferta.vaga.medicos?.nome || 'Médico'} · expira {format(new Date(oferta.oferta_expira_em), 'HH:mm')}</p></div>
                      <Button disabled={actionLoading} onClick={async () => {
                        try {
                          setActionLoading(true);
                          await fetchData(token, 'accept_waitlist_offer', { lista_espera_id: oferta.id });
                          const [ag, ofertas] = await Promise.all([fetchData(token, 'get_agendamentos'), fetchData(token, 'get_waitlist_offers')]);
                          setAgendamentos(ag || []); setOfertasEspera(ofertas || []);
                        } finally { setActionLoading(false); }
                      }}><CheckCircle2 className="mr-2 h-4 w-4" />Aceitar vaga</Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {retornos.length > 0 && (
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader><CardTitle className="text-base">Seus retornos</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {retornos.slice(0, 5).map(retorno => (
                    <div key={retorno.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{format(new Date(`${retorno.data_retorno_prevista}T12:00:00`), 'dd/MM/yyyy')}</p>
                        <p className="text-xs text-muted-foreground">{retorno.motivo || 'Retorno de acompanhamento'} · {retorno.status}</p>
                      </div>
                      {['pendente', 'agendado'].includes(retorno.status) && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={async () => {
                            await fetchData(token, 'confirm_retorno', { retorno_id: retorno.id });
                            setRetornos(await fetchData(token, 'get_retornos'));
                          }}>Confirmar</Button>
                          <Button size="sm" variant="outline" onClick={async () => {
                            const novaData = window.prompt('Nova data do retorno (AAAA-MM-DD):', retorno.data_retorno_prevista);
                            if (!novaData) return;
                            await fetchData(token, 'reschedule_retorno', { retorno_id: retorno.id, nova_data: novaData });
                            setRetornos(await fetchData(token, 'get_retornos'));
                          }}>Remarcar</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}

          <motion.div variants={itemVariants}>
            <NPSSurvey token={token} />
          </motion.div>

          {/* ─── Footer ─── */}
          <motion.div variants={itemVariants}>
            <div className="text-center py-6 space-y-2">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                <span>Seus dados são protegidos pela LGPD</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                EloLab Clínica Médica • Portal seguro do paciente
              </p>
            </div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────
function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="p-4 rounded-2xl bg-muted/50 mb-3">
          <Icon className="h-8 w-8 opacity-40" />
        </div>
        <p className="text-sm">{text}</p>
      </CardContent>
    </Card>
  );
}
