import { nomeMedico } from '@/lib/formatters';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Calendar, FlaskConical, CreditCard, User, ExternalLink, Lock,
  Star, MessageSquare, CheckCircle2, HeartHandshake, Clock,
  Activity, FileText, Phone, Shield, Sparkles, ChevronRight,
  Heart, Pill, AlertTriangle, Download, RefreshCw,
  LogOut,
} from 'lucide-react';
import { format, isToday, isFuture, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { appointmentStartHasPassed, todayDateOnly } from '@/lib/dateOnly';
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

/** "2099-10-15" → "15/10/2099", sem passar por Date (evita deslocamento de fuso). */
function formatarDataIso(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

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
                  aria-label="Código de acesso do paciente"
                  name="patient-access-token"
                  autoComplete="off"
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
              {loading ? 'Verificando…' : 'Acessar Portal'}
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
                  <span>{nomeMedico(proxima.medicos.nome)}</span>
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
              aria-label={`Avaliação ${n} de 5`}
              aria-pressed={nota === n}
              className={`w-9 h-9 rounded-lg text-sm font-semibold transition-[background-color,color,box-shadow,transform] ${
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
                aria-label="Comentário opcional sobre a experiência"
                placeholder="Conte-nos mais sobre sua experiência (opcional)…"
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                rows={2}
                className="text-sm"
              />
              {submitError && <p className="text-xs text-destructive" role="alert">{submitError}</p>}
              <Button onClick={handleSubmit} disabled={sending} className="w-full gap-2" size="sm">
                <Star className="h-3.5 w-3.5" />
                {sending ? 'Enviando…' : 'Enviar Avaliação'}
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
  const autoLoginAttempted = useRef(false);
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
  const [rescheduleSlots, setRescheduleSlots] = useState<string[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSubmitError, setRescheduleSubmitError] = useState('');
  const [rescheduleStateStale, setRescheduleStateStale] = useState(false);
  // Último dia aceito para remarcar, calculado no servidor. Só orienta o campo
  // de data; a recusa de fato continua no servidor.
  const [rescheduleLimite, setRescheduleLimite] = useState<{ agendamentoId: string; limite: string } | null>(null);
  const rescheduleLookupRef = useRef(0);
  const rescheduleTriggersRef = useRef(new Map<string, HTMLButtonElement>());
  const cancelTriggersRef = useRef(new Map<string, HTMLButtonElement>());
  const rescheduleCardsRef = useRef(new Map<string, HTMLDivElement>());
  const lastRescheduleTriggerIdRef = useRef<string | null>(null);
  const lastCancelTriggerIdRef = useRef<string | null>(null);
  const [cancelError, setCancelError] = useState('');
  const [cancelStateStale, setCancelStateStale] = useState(false);
  const cancelExpectedAppointmentRef = useRef<{ data: string; hora_inicio: string | null } | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const [actionError, setActionError] = useState('');
  // Aviso operacional separado do sucesso: a ação valeu, mas algo à parte
  // (ex.: e-mail automático à clínica) não aconteceu.
  const [actionWarning, setActionWarning] = useState('');
  const [agendamentoParaCancelar, setAgendamentoParaCancelar] = useState<string | null>(null);
  const [retornoRemarcar, setRetornoRemarcar] = useState<any>(null);
  const [novaDataRetorno, setNovaDataRetorno] = useState('');
  const [erroRemarcarRetorno, setErroRemarcarRetorno] = useState('');
  const [erroConfirmarRetorno, setErroConfirmarRetorno] = useState('');
  const [retornoConfirmandoId, setRetornoConfirmandoId] = useState<string | null>(null);
  const [erroAceitarOferta, setErroAceitarOferta] = useState('');
  const [ofertaAceitandoId, setOfertaAceitandoId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const closeRescheduleDialog = () => {
    if (actionLoading) return;
    rescheduleLookupRef.current += 1;
    setRescheduleSlotsLoading(false);
    setRescheduleModal(null);
  };

  const fetchData = async (accessToken: string, action: string, bodyData?: any) => {
    const { data, error } = await supabase.functions.invoke('patient-portal', {
      body: { action, token: accessToken, ...bodyData },
    });
    if (error) {
      let message = error.message;
      let code: string | undefined;
      const context = (error as { context?: Response }).context;
      if (context && typeof context.json === 'function') {
        try {
          const payload = await context.json();
          if (payload?.error) message = String(payload.error);
          if (payload?.code) code = String(payload.code);
        } catch {
          // Preserve Supabase's message if the response body is not JSON.
        }
      }
      const enrichedError = new Error(message) as Error & { status?: number; code?: string };
      if (context && typeof context.status === 'number') enrichedError.status = context.status;
      if (code) enrichedError.code = code;
      throw enrichedError;
    }
    if (data && typeof data === 'object' && 'error' in data && data.error) {
      throw new Error(String(data.error));
    }
    return data;
  };

  useEffect(() => {
    if (rescheduleModal || !lastRescheduleTriggerIdRef.current) return;
    const triggerId = lastRescheduleTriggerIdRef.current;
    lastRescheduleTriggerIdRef.current = null;
    const trigger = rescheduleTriggersRef.current.get(triggerId);
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    else rescheduleCardsRef.current.get(triggerId)?.focus({ preventScroll: true });
  }, [rescheduleModal]);

  useEffect(() => {
    if (agendamentoParaCancelar || !lastCancelTriggerIdRef.current) return;
    const triggerId = lastCancelTriggerIdRef.current;
    lastCancelTriggerIdRef.current = null;
    const trigger = cancelTriggersRef.current.get(triggerId);
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    else rescheduleCardsRef.current.get(triggerId)?.focus({ preventScroll: true });
  }, [agendamentoParaCancelar]);

  const handleLogin = async (accessToken = token) => {
    if (!accessToken.trim()) return;
    setLoading(true);
    setError('');

    try {
      const profileData = await fetchData(accessToken, 'get_profile');
      if (!profileData || profileData.error) {
        setError(profileData?.error || 'Token inválido ou expirado');
        return;
      }
      setProfile(profileData);
      setContactForm({ telefone: profileData.telefone || '', email: profileData.email || '' });
      setAuthenticated(true);

      const [ag, ex, pg, presc, docs, rets, ofertas] = await Promise.all([
        fetchData(accessToken, 'get_agendamentos'),
        fetchData(accessToken, 'get_exames'),
        fetchData(accessToken, 'get_pagamentos'),
        fetchData(accessToken, 'get_prescricoes').catch(() => []),
        fetchData(accessToken, 'get_medicos'),
        fetchData(accessToken, 'get_retornos').catch(() => []),
        fetchData(accessToken, 'get_waitlist_offers').catch(() => []),
      ]);
      setAgendamentos(ag || []);
      setExames(ex || []);
      setPagamentos(pg || []);
      setPrescricoes(presc || []);
      setMedicos(docs || []);
      setRetornos(rets || []);
      setOfertasEspera(ofertas || []);
    } catch (err: any) {
      // A resposta técnica da Edge Function (status, nome da função etc.) não
      // ajuda o paciente e revela detalhes internos. Para autenticação por
      // token, toda falha deve ser indistinguível de token ausente/revogado.
      if (import.meta.env.DEV) console.error('Falha ao validar acesso do portal:', err);
      setError('Token inválido ou expirado');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableSlots = async (medico_id: string, data: string) => {
    if (!medico_id || !data || !token) return;
    try {
      setSchedulingLoading(true);
      setSchedulingError('');
      setAvailableSlots([]);
      const slots = await fetchData(token, 'get_available_slots', {
        medico_id,
        data_inicio: data,
        data_fim: data,
      });
      if (!Array.isArray(slots)) throw new Error(slots?.error || 'Nenhum horário disponível nesta data.');
      setAvailableSlots(slots);
      setSchedulingForm(f => ({ ...f, hora_inicio: '' }));
    } catch (err: any) {
      setAvailableSlots([]);
      setSchedulingError(err.message || 'Erro ao carregar horários disponíveis');
    } finally {
      setSchedulingLoading(false);
    }
  };

  const handleRescheduleStateChanged = async (message: string) => {
    setRescheduleStateStale(true);
    setRescheduleSubmitError(`${message} Feche esta janela para ver a situação atual.`);
    setRescheduleSlots([]);
    setRescheduleForm((form) => ({ ...form, hora_inicio: '' }));
    try {
      setAgendamentos(await fetchData(token, 'get_agendamentos'));
    } catch {
      setRescheduleSubmitError(`${message} A lista não foi atualizada; feche a janela e tente recarregar os dados.`);
    }
  };

  const loadRescheduleLimite = async (agendamentoId: string) => {
    try {
      const resposta = await fetchData(token, 'get_remarcacao_limite');
      const limite = resposta?.limite;
      if (typeof limite === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(limite)) {
        setRescheduleLimite({ agendamentoId, limite });
      }
    } catch {
      // Sem o limite o campo fica sem máximo; o servidor ainda recusa datas além dele.
    }
  };

  const loadRescheduleSlots = async (data: string) => {
    const medicoId = rescheduleModal?.medico_id;
    const lookupId = ++rescheduleLookupRef.current;
    setRescheduleForm((form) => ({ ...form, data, hora_inicio: '' }));
    setRescheduleSlots([]);
    setRescheduleError('');
    if (!data || !medicoId) {
      setRescheduleSlotsLoading(false);
      return;
    }

    setRescheduleSlotsLoading(true);
    try {
      const slots = await fetchData(token, 'get_available_slots', {
        medico_id: medicoId,
        data_inicio: data,
        data_fim: data,
        agendamento_id: rescheduleModal.id,
      });
      if (lookupId !== rescheduleLookupRef.current) return;
      if (!Array.isArray(slots)) throw new Error(slots?.error || 'Não foi possível carregar os horários.');
      setRescheduleSlots(slots);
    } catch (err: any) {
      if (lookupId === rescheduleLookupRef.current) {
        if (err.code === 'appointment_state_changed') {
          await handleRescheduleStateChanged(err.message || 'Esta consulta foi atualizada.');
        } else {
          setRescheduleSlots([]);
          setRescheduleError(err.message || 'Não foi possível carregar os horários. Tente novamente.');
        }
      }
    } finally {
      if (lookupId === rescheduleLookupRef.current) setRescheduleSlotsLoading(false);
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

      if (!result?.success) {
        throw new Error(result?.error || 'Não foi possível concluir o agendamento');
      }

      if (result?.success) {
        // Reload agendamentos to show the new one
        const updatedAgendamentos = await fetchData(token, 'get_agendamentos');
        setAgendamentos(updatedAgendamentos || []);
        setSchedulingForm({ medico_id: '', data: '', hora_inicio: '', tipo: 'Consulta' });
        setAvailableSlots([]);
      }
    } catch (err: any) {
      setAvailableSlots([]);
      setSchedulingError(err.message || 'Erro ao agendar consulta');
    } finally {
      setSchedulingLoading(false);
    }
  };

  const handleCancelAppointment = async (agendamento_id: string) => {
    try {
      setActionLoading(true);
      setActionNotice('');
      setActionWarning('');
      setActionError('');
      await fetchData(token, 'cancel_agendamento', {
        agendamento_id,
        motivo: 'Cancelado pelo paciente',
        expected_data: cancelExpectedAppointmentRef.current?.data,
        expected_hora_inicio: cancelExpectedAppointmentRef.current?.hora_inicio,
      });
      setAgendamentos((current) => current.map((appointment: any) =>
        appointment.id === agendamento_id ? { ...appointment, status: 'cancelado' } : appointment,
      ));
      setCancelError('');
      setActionNotice('Consulta cancelada.');
      try {
        setAgendamentos((await fetchData(token, 'get_agendamentos')) || []);
      } catch {
        setActionError('Consulta cancelada, mas não foi possível atualizar a lista. Atualize a página para ver a situação atual.');
      }
      return true;
    } catch (err: any) {
      const message = err.message || 'Não foi possível cancelar a consulta. Tente novamente.';
      if (err.code === 'appointment_state_changed') {
        setCancelStateStale(true);
        try {
          setAgendamentos(await fetchData(token, 'get_agendamentos'));
          setCancelError(`${message} A lista foi atualizada. Feche esta janela para ver a situação atual.`);
        } catch {
          setCancelError(`${message} Feche esta janela e tente atualizar a lista.`);
        }
      } else {
        setCancelError(message);
      }
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleRescheduleReturn = async () => {
    if (!retornoRemarcar || !novaDataRetorno) return;
    if (novaDataRetorno < todayDateOnly()) {
      setErroRemarcarRetorno('Escolha hoje ou uma data futura.');
      return;
    }

    setActionLoading(true);
    setErroRemarcarRetorno('');
    try {
      await fetchData(token, 'reschedule_retorno', {
        retorno_id: retornoRemarcar.id,
        nova_data: novaDataRetorno,
      });
      setRetornos(await fetchData(token, 'get_retornos'));
      setRetornoRemarcar(null);
    } catch (err: any) {
      setErroRemarcarRetorno(err.message || 'Não foi possível remarcar o retorno. Tente novamente.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReturn = async (retornoId: string) => {
    setActionLoading(true);
    setRetornoConfirmandoId(retornoId);
    setErroConfirmarRetorno('');
    try {
      await fetchData(token, 'confirm_retorno', { retorno_id: retornoId });
      setRetornos(await fetchData(token, 'get_retornos'));
    } catch (err: any) {
      setErroConfirmarRetorno(err.message || 'Não foi possível confirmar o retorno. Tente novamente.');
    } finally {
      setActionLoading(false);
      setRetornoConfirmandoId(null);
    }
  };

  const handleAcceptWaitlistOffer = async (ofertaId: string) => {
    setActionLoading(true);
    setOfertaAceitandoId(ofertaId);
    setErroAceitarOferta('');
    try {
      await fetchData(token, 'accept_waitlist_offer', { lista_espera_id: ofertaId });
      const [agendamentosAtualizados, ofertasAtualizadas] = await Promise.all([
        fetchData(token, 'get_agendamentos'),
        fetchData(token, 'get_waitlist_offers'),
      ]);
      setAgendamentos(agendamentosAtualizados || []);
      setOfertasEspera(ofertasAtualizadas || []);
    } catch (err: any) {
      setErroAceitarOferta(err.message || 'Não foi possível aceitar a vaga. Atualize a lista e tente novamente.');
    } finally {
      setActionLoading(false);
      setOfertaAceitandoId(null);
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

  const handleConfirmAppointment = async (agendamento_id: string, expectedData: string, expectedHoraInicio: string | null) => {
    try {
      setActionLoading(true);
      setActionError('');
      setActionNotice('');
      setActionWarning('');
      await fetchData(token, 'confirm_agendamento', {
        agendamento_id,
        expected_data: expectedData,
        expected_hora_inicio: expectedHoraInicio,
      });
      setAgendamentos((current) => current.map((appointment: any) =>
        appointment.id === agendamento_id ? { ...appointment, status: 'confirmado' } : appointment,
      ));
      setActionNotice('Consulta confirmada.');
      try {
        setAgendamentos(await fetchData(token, 'get_agendamentos'));
      } catch {
        setActionError('Consulta confirmada, mas não foi possível atualizar a lista. Atualize a página para ver a situação atual.');
      }
    } catch (err: any) {
      const message = err.message || 'Não foi possível confirmar a consulta. Tente novamente.';
      if (err.code === 'appointment_state_changed') {
        try {
          setAgendamentos(await fetchData(token, 'get_agendamentos'));
          setActionError(`${message} A lista foi atualizada.`);
        } catch {
          setActionError(`${message} Atualize a lista para ver a situação atual.`);
        }
      } else {
        setActionError(message);
      }
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
      setActionNotice('');
      setActionWarning('');
      setActionError('');
      setRescheduleError('');
      setRescheduleSubmitError('');
      const resposta = await fetchData(token, 'reschedule_agendamento', {
        agendamento_id: rescheduleModal.id,
        nova_data: rescheduleForm.data,
        novo_horario: rescheduleForm.hora_inicio,
      });
      setAgendamentos((current) => current.map((appointment: any) =>
        appointment.id === rescheduleModal.id
          // O servidor volta a consulta para "agendado" ao remarcar: a
          // confirmação anterior não vale para o novo horário.
          ? { ...appointment, data: rescheduleForm.data, hora_inicio: rescheduleForm.hora_inicio, status: 'agendado' }
          : appointment,
      ));
      setRescheduleModal(null);
      setRescheduleForm({ data: '', hora_inicio: '' });
      const [year, month, day] = rescheduleForm.data.split('-');
      setActionNotice(`Consulta remarcada para ${day}/${month}/${year} às ${rescheduleForm.hora_inicio}.`);
      // A remarcação valeu; `aviso` só diz que a clínica não recebeu o e-mail automático.
      if (typeof resposta?.aviso === 'string' && resposta.aviso) setActionWarning(resposta.aviso);
      try {
        setAgendamentos((await fetchData(token, 'get_agendamentos')) || []);
      } catch {
        setActionError('Consulta remarcada, mas não foi possível atualizar a lista. Atualize a página para ver a situação atual.');
      }
    } catch (err: any) {
      const message = err.message || 'Não foi possível remarcar a consulta. Tente novamente.';
      const stateChanged = err.code === 'appointment_state_changed';
      if (stateChanged) {
        await handleRescheduleStateChanged(message);
        return;
      }
      setRescheduleSubmitError(message);
      setRescheduleForm((form) => ({ ...form, hora_inicio: '' }));
      void loadRescheduleSlots(rescheduleForm.data);
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken && !autoLoginAttempted.current) {
      autoLoginAttempted.current = true;
      // O link pode chegar por e-mail/WhatsApp, mas o segredo não deve
      // permanecer no histórico, em screenshots ou no Referer de navegação.
      // O estado React mantém o token apenas em memória durante esta sessão.
      const sanitizedUrl = new URL(window.location.href);
      sanitizedUrl.searchParams.delete('token');
      window.history.replaceState({}, '', `${sanitizedUrl.pathname}${sanitizedUrl.search}${sanitizedUrl.hash}`);
      setToken(urlToken);
      void handleLogin(urlToken);
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
  // Ignora um limite que chegou para outra consulta (diálogo reaberto antes da resposta).
  const limiteRemarcacao = rescheduleLimite && rescheduleLimite.agendamentoId === rescheduleModal?.id
    ? rescheduleLimite.limite
    : undefined;

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
      <AlertDialog
        open={agendamentoParaCancelar !== null}
        onOpenChange={(open) => {
          if (!open && !actionLoading) {
            lastCancelTriggerIdRef.current = agendamentoParaCancelar;
            setAgendamentoParaCancelar(null);
            setCancelStateStale(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta consulta?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. Se precisar de outro horário, você poderá solicitar um novo agendamento depois.
            </AlertDialogDescription>
            {cancelError && <p role="alert" className="text-sm text-destructive">{cancelError}</p>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>{cancelStateStale ? 'Fechar' : 'Manter consulta'}</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionLoading || cancelStateStale}
              onClick={(event) => {
                event.preventDefault();
                if (!agendamentoParaCancelar) return;
                void handleCancelAppointment(agendamentoParaCancelar).then((cancelado) => {
                  if (cancelado) setAgendamentoParaCancelar(null);
                });
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading ? 'Cancelando…' : 'Confirmar cancelamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={retornoRemarcar !== null}
        onOpenChange={(open) => {
          if (!open && !actionLoading) setRetornoRemarcar(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remarcar retorno</DialogTitle>
            <DialogDescription>Escolha uma nova data para seu retorno. A clínica poderá confirmar o horário.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="nova-data-retorno" className="text-sm font-medium">Nova data</label>
            <Input
              id="nova-data-retorno"
              type="date"
              min={todayDateOnly()}
              value={novaDataRetorno}
              onChange={(event) => setNovaDataRetorno(event.target.value)}
              disabled={actionLoading}
              aria-invalid={Boolean(erroRemarcarRetorno)}
              aria-describedby={erroRemarcarRetorno ? 'erro-remarcar-retorno' : undefined}
            />
            {erroRemarcarRetorno && <p id="erro-remarcar-retorno" role="alert" className="text-sm text-destructive">{erroRemarcarRetorno}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRetornoRemarcar(null)} disabled={actionLoading}>Voltar</Button>
            <Button type="button" onClick={handleRescheduleReturn} disabled={actionLoading || !novaDataRetorno}>
              {actionLoading ? 'Remarcando…' : 'Confirmar nova data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
          <p role="status" aria-live="polite" aria-atomic="true" className={actionNotice ? 'rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm' : 'sr-only'}>{actionNotice}</p>
          {actionWarning && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <p><span className="font-medium">Atenção: </span>{actionWarning}</p>
            </div>
          )}
          {actionError && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{actionError}</p>}

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
                            {nomeMedico(m.nome)} {m.especialidade && `— ${m.especialidade}`}
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
                                className={`py-2 px-3 rounded-lg text-sm font-medium transition-[background-color,color,box-shadow,transform] ${
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
                      {schedulingLoading ? 'Agendando…' : 'Confirmar Agendamento'}
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
                    const passado = appointmentStartHasPassed(a.data, a.hora_inicio);
                    return (
                    <motion.div
                      key={a.id}
                      ref={(element) => {
                        if (element) rescheduleCardsRef.current.set(a.id, element);
                        else rescheduleCardsRef.current.delete(a.id);
                      }}
                      tabIndex={-1}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <Card className={`transition-[background-color,border-color,box-shadow,transform] hover:shadow-md ${passado ? 'opacity-60' : ''}`}>
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-start gap-3 flex-1">
                                  <div className={`p-2.5 rounded-xl ${isToday(dataAg) ? 'bg-primary/20' : 'bg-muted'}`}>
                                    <Calendar className={`h-4 w-4 ${isToday(dataAg) ? 'text-primary' : 'text-muted-foreground'}`} />
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="flex items-center font-semibold text-sm">
                                      {a.tipo || 'Consulta'}
                                      {isToday(dataAg) && <Badge className="ml-2 bg-primary text-primary-foreground text-[9px]">HOJE</Badge>}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      {format(dataAg, "dd 'de' MMM, yyyy", { locale: ptBR })}
                                      {a.hora_inicio && ` às ${a.hora_inicio.slice(0, 5)}`}
                                    </p>
                                    {a.medicos?.nome && (
                                      <p className="text-xs text-muted-foreground">
                                        {nomeMedico(a.medicos.nome)}
                                        {a.medicos.especialidade && ` — ${a.medicos.especialidade}`}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <StatusBadge status={a.status} />
                              </div>

                              {/* Action buttons for future appointments */}
                              {!passado && ['agendado', 'confirmado'].includes(a.status) && (
                                <div className="flex gap-2 pt-2 border-t">
                                  {!['confirmado', 'em_atendimento', 'finalizado'].includes(a.status) && (
                                    <Button size="sm" onClick={() => handleConfirmAppointment(a.id, a.data, a.hora_inicio ?? null)} disabled={actionLoading} className="flex-1 text-xs">
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirmar
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    ref={(element) => {
                                      if (element) rescheduleTriggersRef.current.set(a.id, element);
                                      else rescheduleTriggersRef.current.delete(a.id);
                                    }}
                                    onClick={() => {
                                      lastRescheduleTriggerIdRef.current = a.id;
                                      rescheduleLookupRef.current += 1;
                                      setRescheduleSlotsLoading(false);
                                      setRescheduleError('');
                                      setRescheduleSubmitError('');
                                      setRescheduleStateStale(false);
                                      setRescheduleSlots([]);
                                      setRescheduleForm({ data: '', hora_inicio: '' });
                                      setRescheduleLimite(null);
                                      setRescheduleModal(a);
                                      void loadRescheduleLimite(a.id);
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
                                      setCancelError('');
                                      setCancelStateStale(false);
                                      cancelExpectedAppointmentRef.current = { data: a.data, hora_inicio: a.hora_inicio ?? null };
                                      lastCancelTriggerIdRef.current = a.id;
                                      setAgendamentoParaCancelar(a.id);
                                    }}
                                    ref={(element) => {
                                      if (element) cancelTriggersRef.current.set(a.id, element);
                                      else cancelTriggersRef.current.delete(a.id);
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
                        <Card className={`transition-[background-color,border-color,box-shadow,transform] hover:shadow-md ${isLaudo ? 'border-green-300' : ''}`}>
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
                                      {e.resultado.length > 120 ? e.resultado.slice(0, 120) + '…' : e.resultado}
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
                      <Card className="transition-[background-color,border-color,box-shadow,transform] hover:shadow-md">
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
                                {p.medicos?.nome && ` — ${nomeMedico(p.medicos.nome)}`}
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
                                    {a.medicos?.nome && ` — ${nomeMedico(a.medicos.nome)}`}
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
                      <Card className="transition-[background-color,border-color,box-shadow,transform] hover:shadow-md">
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

          <Dialog
            open={Boolean(rescheduleModal)}
            onOpenChange={(open) => {
              if (!open) closeRescheduleDialog();
            }}
          >
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Remarcar consulta</DialogTitle>
                <DialogDescription>
                  Médico: {nomeMedico(rescheduleModal?.medicos?.nome || 'seu médico')}. Escolha uma data e um horário livre.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {rescheduleModal?.data && (
                  <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm" data-testid="reschedule-current">
                    <span className="text-muted-foreground">Consulta atual: </span>
                    <span className="font-medium">
                      {formatarDataIso(rescheduleModal.data)}
                      {rescheduleModal.hora_inicio ? ` às ${String(rescheduleModal.hora_inicio).slice(0, 5)}` : ''}
                    </span>
                  </p>
                )}
                <div className="space-y-2">
                  <label htmlFor="reschedule-date" className="text-sm font-medium">Nova data *</label>
                  <input
                    id="reschedule-date"
                    type="date"
                    value={rescheduleForm.data}
                    onChange={(event) => {
                      setRescheduleSubmitError('');
                      void loadRescheduleSlots(event.target.value);
                    }}
                    min={todayDateOnly()}
                    max={limiteRemarcacao}
                    aria-describedby={limiteRemarcacao ? 'reschedule-date-limit' : undefined}
                    disabled={actionLoading || rescheduleStateStale}
                    className="w-full px-3 py-2 border rounded-lg bg-background text-foreground disabled:opacity-60"
                  />
                  {limiteRemarcacao && (
                    <p id="reschedule-date-limit" className="text-xs text-muted-foreground">
                      É possível remarcar pelo portal até {formatarDataIso(limiteRemarcacao)}.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="reschedule-time" className="text-sm font-medium">Horário disponível *</label>
                  <select
                    id="reschedule-time"
                    value={rescheduleForm.hora_inicio}
                    onChange={(event) => setRescheduleForm((form) => ({ ...form, hora_inicio: event.target.value }))}
                    disabled={actionLoading || rescheduleStateStale || rescheduleSlotsLoading || rescheduleSlots.length === 0}
                    className="w-full px-3 py-2 border rounded-lg bg-background text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">{rescheduleSlotsLoading ? 'Buscando horários…' : 'Selecione um horário'}</option>
                    {rescheduleSlots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                  </select>
                  {rescheduleError && <p role="alert" className="text-sm text-destructive">{rescheduleError}</p>}
                  <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                        {rescheduleSlotsLoading ? 'Buscando horários livres…' : !rescheduleStateStale && !rescheduleError && rescheduleForm.data && rescheduleSlots.length === 0 ? 'Nenhum horário disponível nesta data. Escolha outra data.' : ''}
                  </p>
                  {rescheduleError && rescheduleForm.data && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => void loadRescheduleSlots(rescheduleForm.data)} disabled={rescheduleSlotsLoading}>
                      Tentar carregar novamente
                    </Button>
                  )}
                </div>
              </div>

              {rescheduleSubmitError && <p role="alert" className="text-sm text-destructive">{rescheduleSubmitError}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={closeRescheduleDialog} disabled={actionLoading}>Voltar</Button>
                <Button
                  onClick={handleRescheduleAppointment}
                  disabled={rescheduleStateStale || !rescheduleForm.data || !rescheduleForm.hora_inicio || actionLoading || rescheduleSlotsLoading}
                >
                  {actionLoading ? 'Remarcando…' : 'Confirmar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ─── NPS Survey ─── */}
          {ofertasEspera.length > 0 && (
            <motion.div variants={itemVariants}>
              <Card className="border-primary/40 bg-primary/5">
                <CardHeader><CardTitle className="text-base">Vaga disponível para você</CardTitle><CardDescription>A reserva expira automaticamente; confirme para garantir o horário.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {erroAceitarOferta && <p role="alert" className="text-sm text-destructive">{erroAceitarOferta}</p>}
                  {ofertasEspera.map(oferta => (
                    <div key={oferta.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
                      <div><p className="font-medium">{format(new Date(`${oferta.vaga.data}T12:00:00`), 'dd/MM/yyyy')} às {oferta.vaga.hora_inicio?.slice(0, 5)}</p>
                        <p className="text-xs text-muted-foreground">{nomeMedico(oferta.vaga.medicos?.nome || 'Médico')} · expira {format(new Date(oferta.oferta_expira_em), 'HH:mm')}</p></div>
                      <Button disabled={actionLoading} onClick={() => void handleAcceptWaitlistOffer(oferta.id)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        {ofertaAceitandoId === oferta.id ? 'Reservando…' : 'Aceitar vaga'}
                      </Button>
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
                  {erroConfirmarRetorno && <p role="alert" className="text-sm text-destructive">{erroConfirmarRetorno}</p>}
                  {retornos.slice(0, 5).map(retorno => (
                    <div key={retorno.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{format(new Date(`${retorno.data_retorno_prevista}T12:00:00`), 'dd/MM/yyyy')}</p>
                        <p className="text-xs text-muted-foreground">{retorno.motivo || 'Retorno de acompanhamento'} · {retorno.status}</p>
                      </div>
                      {['pendente', 'agendado'].includes(retorno.status) && (
                        <div className="flex gap-2">
                          <Button size="sm" disabled={actionLoading} onClick={() => void handleConfirmReturn(retorno.id)}>
                            {retornoConfirmandoId === retorno.id ? 'Confirmando…' : 'Confirmar'}
                          </Button>
                          <Button size="sm" variant="outline" disabled={actionLoading} onClick={() => {
                            setErroRemarcarRetorno('');
                            setNovaDataRetorno(retorno.data_retorno_prevista);
                            setRetornoRemarcar(retorno);
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
