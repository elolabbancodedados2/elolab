import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, Mail, MessageCircle, Phone, Stethoscope } from 'lucide-react';
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCPF, formatPhone, validateCPF } from '@/lib/formatters';
import Logo from '@/components/landing-v2/Logo';

const CARD = 'rounded-xl border-border bg-card shadow-none';
const INPUT = 'h-11 rounded-lg focus-visible:ring-primary';
const BTN_PRIMARY = 'rounded-lg bg-primary text-primary-foreground shadow-none hover:bg-primary/90';

interface Medico { id: string; nome: string; especialidade: string | null }
interface Info {
  clinica: { nome: string; telefone?: string; celular?: string; email?: string };
  mensagem: string | null;
  horarios_funcionamento: {
    dias: string[];
    abertura: string;
    fechamento: string;
    almoco: { inicio: string; fim: string } | null;
    sabado: { abertura: string; fechamento: string } | null;
  } | null;
  medicos: Medico[];
  dias_antecedencia: number;
  hoje: string;
}

class ErroAgendamentoPublico extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('public-booking', { body });
  // A função devolve o motivo em `error` no corpo; o invoke embrulha status != 2xx.
  if (error) {
    const contexto = (error as any)?.context;
    let mensagem = 'Não foi possível concluir agora. Tente novamente.';
    let code: string | undefined;
    try { const payload = await contexto?.json(); mensagem = payload?.error || mensagem; code = payload?.code; } catch { /* corpo não-JSON */ }
    throw new ErroAgendamentoPublico(mensagem, code);
  }
  if (data?.error) throw new ErroAgendamentoPublico(data.error, data.code);
  return data as T;
}

/**
 * Libera a reserva ao fechar a aba. O invoke comum é cancelado junto com a
 * página; `keepalive` deixa a requisição terminar depois do pagehide.
 */
function liberarAoSair(reserva: { token: string; clinicaId: string }) {
  try {
    void fetch(`${SUPABASE_URL}/functions/v1/public-booking`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ action: 'release', clinica_id: reserva.clinicaId, hold_token: reserva.token }),
    }).catch(() => undefined);
  } catch {
    // Sem fetch com keepalive, a reserva expira sozinha em cinco minutos.
  }
}

const RESERVA_MS = 5 * 60_000 - 5_000;

function formatarContagem(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function AgendamentoOnline() {
  const { clinicaId = '' } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [erroInfo, setErroInfo] = useState('');
  const [medico, setMedico] = useState<Medico | null>(null);
  const [data, setData] = useState('');
  const [inicioDias, setInicioDias] = useState(0);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [carregandoSlots, setCarregandoSlots] = useState(false);
  const [erroSlots, setErroSlots] = useState('');
  const [hora, setHora] = useState('');
  const [holdToken, setHoldToken] = useState('');
  const [reservandoHora, setReservandoHora] = useState(false);
  const [form, setForm] = useState({ nome: '', cpf: '', telefone: '', email: '', data_nascimento: '', website: '' });
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [concluido, setConcluido] = useState('');
  const [recarregar, setRecarregar] = useState(0);
  const [recarregarInfo, setRecarregarInfo] = useState(0);
  const bookingRequestRef = useRef(0);
  const holdRequestRef = useRef(0);
  const holdRef = useRef<{ token: string; clinicaId: string } | null>(null);
  const sucessoRef = useRef<HTMLDivElement>(null);
  const erroRef = useRef<HTMLParagraphElement>(null);
  const etapaHorarioRef = useRef<HTMLDivElement>(null);
  const etapaDadosRef = useRef<HTMLDivElement>(null);
  const [reservaAte, setReservaAte] = useState<number | null>(null);
  const [agoraMs, setAgoraMs] = useState(() => Date.now());
  const [diasComVaga, setDiasComVaga] = useState<Set<string> | null>(null);

  const liberarReserva = (reserva = holdRef.current, aoSair = false) => {
    holdRequestRef.current += 1;
    setReservandoHora(false);
    setReservaAte(null);
    if (!reserva) return;
    if (holdRef.current?.token === reserva.token) holdRef.current = null;
    setHoldToken('');
    if (aoSair) liberarAoSair(reserva);
    else void chamar({ action: 'release', clinica_id: reserva.clinicaId, hold_token: reserva.token }).catch(() => undefined);
  };

  // A próxima etapa aparece abaixo da dobra no celular: leva a pessoa até ela.
  const rolarAte = (ref: React.RefObject<HTMLElement>) => {
    window.setTimeout(() => ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 50);
  };

  const selecionarHorario = async (candidato: string) => {
    if (!medico || !data || reservandoHora) return;
    if (holdRef.current && hora === candidato) return;
    const requestId = ++holdRequestRef.current;
    const reservaAnterior = holdRef.current;
    holdRef.current = null;
    setHoldToken('');
    setHora('');
    setReservandoHora(true);
    setErro('');
    if (reservaAnterior) {
      void chamar({ action: 'release', clinica_id: reservaAnterior.clinicaId, hold_token: reservaAnterior.token }).catch(() => undefined);
    }
    const token = crypto.randomUUID();
    try {
      await chamar({ action: 'hold', clinica_id: clinicaId, medico_id: medico.id, data, hora: candidato, hold_token: token });
      if (requestId !== holdRequestRef.current) {
        void chamar({ action: 'release', clinica_id: clinicaId, hold_token: token }).catch(() => undefined);
        return;
      }
      holdRef.current = { token, clinicaId };
      setHoldToken(token);
      setHora(candidato);
      setReservaAte(Date.now() + RESERVA_MS);
      rolarAte(etapaDadosRef);
    } catch (error) {
      if (requestId !== holdRequestRef.current) return;
      void chamar({ action: 'release', clinica_id: clinicaId, hold_token: token }).catch(() => undefined);
      setErro(error instanceof Error ? error.message : 'Não foi possível reservar este horário.');
      setRecarregar((n) => n + 1);
    } finally {
      if (requestId === holdRequestRef.current) setReservandoHora(false);
    }
  };

  // Fechar a aba ou sair da página libera o horário para outra pessoa.
  useEffect(() => {
    const aoSair = () => liberarReserva(holdRef.current, true);
    window.addEventListener('pagehide', aoSair);
    return () => { window.removeEventListener('pagehide', aoSair); liberarReserva(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contagem regressiva da reserva, visível enquanto a pessoa preenche os dados.
  useEffect(() => {
    if (!reservaAte) return;
    const timer = window.setInterval(() => setAgoraMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [reservaAte]);

  // A reserva vale cinco minutos; ao vencer, a pessoa é avisada e escolhe de novo.
  useEffect(() => {
    if (!holdToken) return;
    const timer = window.setTimeout(() => {
      liberarReserva();
      setHora('');
      setErro('A reserva de cinco minutos terminou. Escolha o horário de novo para continuar.');
      setRecarregar((n) => n + 1);
    }, RESERVA_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdToken]);

  useEffect(() => {
    // O roteador pode reutilizar esta página quando o link muda de clínica.
    // Dados pessoais e consentimento pertencem ao contexto da clínica anterior.
    bookingRequestRef.current += 1;
    liberarReserva();
    setInicioDias(0);
    setForm({ nome: '', cpf: '', telefone: '', email: '', data_nascimento: '', website: '' });
    setAceite(false);
    setErro('');
    setErroSlots('');
    setEnviando(false);
  }, [clinicaId]);

  useEffect(() => {
    let ativo = true;
    setInfo(null);
    setErroInfo('');
    setMedico(null);
    setData('');
    setSlots(null);
    setHora('');
    setConcluido('');
    chamar<Info>({ action: 'info', clinica_id: clinicaId })
      .then((resultado) => { if (ativo) setInfo(resultado); })
      .catch((e) => { if (ativo) setErroInfo(e.message); });
    return () => { ativo = false; };
  }, [clinicaId, recarregarInfo]);

  const mudarPaginaDias = (novoInicio: number) => {
    liberarReserva();
    setInicioDias(novoInicio);
    setData('');
    setSlots(null);
    setHora('');
    setErroSlots('');
    setErro('');
  };

  useEffect(() => {
    if (concluido) sucessoRef.current?.focus();
  }, [concluido]);

  useEffect(() => {
    if (erro && !hora) erroRef.current?.focus();
  }, [erro, hora]);

  const totalDias = Math.min(info?.dias_antecedencia ?? 14, 180) + 1;
  const dias = useMemo(() => {
    const hoje = info?.hoje ? parseISO(info.hoje) : new Date();
    const quantidade = Math.min(14, Math.max(0, totalDias - inicioDias));
    return Array.from({ length: quantidade }, (_, i) => format(addDays(hoje, inicioDias + i), 'yyyy-MM-dd'));
  }, [info?.hoje, inicioDias, totalDias]);

  useEffect(() => {
    if (!medico || !data) return;
    let ativo = true;
    setCarregandoSlots(true); setSlots(null); setHora(''); setErroSlots('');
    chamar<{ slots: string[] }>({ action: 'slots', clinica_id: clinicaId, medico_id: medico.id, data })
      .then((r) => { if (ativo) setSlots(r.slots); })
      .catch((e) => { if (ativo) setErroSlots(e.message); })
      .finally(() => { if (ativo) setCarregandoSlots(false); });
    return () => { ativo = false; };
  }, [medico, data, clinicaId, recarregar]);

  // Marca os dias sem vaga da página exibida. Se o servidor não souber
  // responder (versão anterior da função), todos os dias seguem clicáveis.
  useEffect(() => {
    setDiasComVaga(null);
    if (!medico || dias.length === 0) return;
    let ativo = true;
    chamar<{ dias: string[] }>({ action: 'dias', clinica_id: clinicaId, medico_id: medico.id, datas: dias })
      .then((r) => { if (ativo && Array.isArray(r?.dias)) setDiasComVaga(new Set(r.dias)); })
      .catch(() => undefined);
    return () => { ativo = false; };
  }, [medico, dias, clinicaId]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    if (!medico || !data || !hora || !holdToken) return;
    const nomeCompleto = form.nome.trim().replace(/\s+/g, ' ');
    if (nomeCompleto.split(' ').length < 2) {
      setErro('Informe nome e sobrenome.');
      document.getElementById('ag-nome')?.focus();
      return;
    }
    if (!validateCPF(form.cpf)) {
      setErro('CPF inválido. Confira os números digitados.');
      document.getElementById('ag-cpf')?.focus();
      return;
    }
    if (form.telefone.replace(/\D/g, '').length < 10) {
      setErro('Informe um telefone com DDD.');
      document.getElementById('ag-tel')?.focus();
      return;
    }
    const requestId = ++bookingRequestRef.current;
    const clinicIdAtStart = clinicaId;
    setEnviando(true); setErro('');
    try {
      const r = await chamar<{ message: string }>({
        action: 'book', clinica_id: clinicIdAtStart, medico_id: medico.id, data, hora,
        hold_token: holdToken, ...form, aceite_lgpd: aceite,
      });
      if (requestId !== bookingRequestRef.current) return;
      holdRef.current = null;
      setHoldToken('');
      setReservaAte(null);
      setConcluido(r.message);
    } catch (err) {
      if (requestId !== bookingRequestRef.current) return;
      const erro = err instanceof Error ? err : new Error('Não foi possível concluir agora. Tente novamente.');
      setErro(erro.message);
      if (erro instanceof ErroAgendamentoPublico && ['slot_unavailable', 'booking_unavailable', 'hold_expired'].includes(erro.code || '')) {
        holdRef.current = null;
        setHoldToken('');
        setHora('');
        setRecarregar((n) => n + 1);
      }
    } finally {
      if (requestId === bookingRequestRef.current) setEnviando(false);
    }
  };

  if (erroInfo) {
    return (
      <Shell>
        <Card className={CARD}><CardContent className="py-12 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarCheck className="h-7 w-7" aria-hidden="true" /></span>
          <p role="alert" className="font-medium">{erroInfo}</p>
          <p className="mt-1 text-sm text-muted-foreground">Entre em contato com a clínica por telefone ou WhatsApp.</p>
          <Button className={cn('mt-4 h-11 px-6', BTN_PRIMARY)} onClick={() => { setErroInfo(''); setRecarregarInfo((n) => n + 1); }}>Tentar novamente</Button>
        </CardContent></Card>
      </Shell>
    );
  }
  if (!info) return <Shell><div role="status" aria-live="polite" aria-label="Carregando informações da clínica"><Skeleton className="h-10 w-2/3 rounded-xl" /><Skeleton className="mt-4 h-64 w-full rounded-2xl" /></div></Shell>;
  const contatoTelefone = info.clinica.celular || info.clinica.telefone;
  const contatoDigitos = contatoTelefone?.replace(/\D/g, '') || '';
  const numeroWhatsApp = contatoDigitos.length === 10 || contatoDigitos.length === 11
    ? `55${contatoDigitos}`
    : contatoDigitos;

  if (concluido) {
    return (
      <Shell titulo={info.clinica.nome}>
        <Card className={CARD}><CardContent ref={sucessoRef} tabIndex={-1} role="status" aria-live="polite" className="py-12 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-success text-success-foreground"><CheckCircle2 className="h-8 w-8" aria-hidden="true" /></span>
          <p className="text-lg font-semibold">{concluido}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {medico?.nome} · {format(parseISO(data), "EEEE, d 'de' MMMM", { locale: ptBR })} às {hora}
          </p>
        </CardContent></Card>
        {contatoDigitos.length >= 10 && (
          <Card className={CARD}>
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">Precisa remarcar ou tirar uma dúvida? Fale com a clínica.</p>
              <div className="flex gap-2">
                <Button asChild variant="outline" className="h-10 flex-1 gap-2 rounded-full sm:flex-none">
                  <a href={`https://wa.me/${numeroWhatsApp}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp</a>
                </Button>
                <Button asChild variant="outline" className="h-10 flex-1 gap-2 rounded-full sm:flex-none">
                  <a href={`tel:${contatoDigitos}`}><Phone className="h-4 w-4" />Ligar</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </Shell>
    );
  }

  return (
    <Shell titulo={info.clinica.nome} subtitulo={info.mensagem || 'Escolha o profissional, o dia e o horário.'}>
      <fieldset disabled={enviando} aria-busy={enviando} className="block space-y-4 border-0 p-0 m-0 min-w-0">
      <ol aria-label="Etapas do agendamento" className="grid grid-cols-3 gap-1.5 text-xs">
        {['Profissional', 'Dia e horário', 'Seus dados'].map((rotulo, i) => {
          const etapaAtual = hora ? 2 : medico ? 1 : 0;
          const estado = i < etapaAtual ? 'feita' : i === etapaAtual ? 'atual' : 'futura';
          return (
            <li key={rotulo} aria-current={estado === 'atual' ? 'step' : undefined}
              className={cn('flex min-h-11 items-center gap-1.5 rounded-lg border px-2 py-1.5',
                estado === 'atual' ? 'border-transparent bg-foreground text-background' : 'border-border bg-card',
                estado === 'futura' && 'text-muted-foreground')}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-semibold tabular-nums">
                {estado === 'feita' ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 truncate font-medium">{rotulo}</span>
            </li>
          );
        })}
      </ol>
      {info.horarios_funcionamento && (
        <Card className={CARD}>
          <CardContent className="flex items-start gap-3 py-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Clock className="h-4 w-4" aria-hidden="true" /></span>
            <div className="space-y-1 text-sm">
              <p className="font-medium">Funcionamento geral da clínica</p>
              {info.horarios_funcionamento.dias.length > 0 && <p className="text-muted-foreground">
                {info.horarios_funcionamento.dias.join(', ')}: {info.horarios_funcionamento.abertura}–{info.horarios_funcionamento.fechamento}
                {info.horarios_funcionamento.almoco && ` · Intervalo ${info.horarios_funcionamento.almoco.inicio}–${info.horarios_funcionamento.almoco.fim}`}
              </p>}
              {info.horarios_funcionamento.sabado && (
                <p className="text-muted-foreground">Sábado: {info.horarios_funcionamento.sabado.abertura}–{info.horarios_funcionamento.sabado.fechamento}</p>
              )}
              <p className="text-xs text-muted-foreground">Os horários disponíveis para agendamento dependem da agenda de cada profissional.</p>
            </div>
          </CardContent>
        </Card>
      )}
      {/* 1. Profissional */}
      <Card className={CARD}>
        <CardHeader className="pb-3"><CardTitle className="text-base font-semibold">1. Profissional</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {info.medicos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum profissional com agenda online no momento.</p>}
          {info.medicos.map((m) => (
            <button key={m.id} type="button" aria-pressed={medico?.id === m.id} onClick={() => { liberarReserva(); setMedico(m); setData(''); setSlots(null); setHora(''); setErro(''); rolarAte(etapaHorarioRef); }}
              className={cn('flex min-h-14 items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted',
                medico?.id === m.id && 'border-primary bg-primary/10 ring-1 ring-primary/50')}>
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary', medico?.id === m.id && 'bg-primary text-primary-foreground')}>
                <Stethoscope className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0"><span className="block truncate font-medium">{m.nome}</span>
                {m.especialidade && <span className="block truncate text-xs text-muted-foreground">{m.especialidade}</span>}</span>
            </button>
          ))}
        </CardContent>
      </Card>
      {info.medicos.length === 0 && (contatoDigitos.length >= 10 || info.clinica.email) && (
        <Card className={CARD}>
          <CardContent className="space-y-3 py-4">
            <div>
              <p className="font-medium">Precisa agendar uma consulta?</p>
              <p className="text-sm text-muted-foreground">Entre em contato com a clínica para verificar outras opções de horário.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {contatoDigitos.length >= 10 && (
                <Button asChild variant="outline" className="h-10 gap-2 rounded-full">
                  <a href={`tel:${contatoDigitos}`}><Phone className="h-4 w-4" />Ligar</a>
                </Button>
              )}
              {contatoDigitos.length >= 10 && (
                <Button asChild variant="outline" className="h-10 gap-2 rounded-full">
                  <a href={`https://wa.me/${numeroWhatsApp}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp</a>
                </Button>
              )}
              {info.clinica.email && (
                <Button asChild variant="outline" className="h-10 gap-2 rounded-full">
                  <a href={`mailto:${info.clinica.email}`}><Mail className="h-4 w-4" />E-mail</a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. Dia e horário */}
      {medico && (
        <Card ref={etapaHorarioRef} className={cn(CARD, 'scroll-mt-4')}>
          <CardHeader className="pb-3"><CardTitle className="text-base font-semibold">2. Dia e horário</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" size="icon" className="rounded-full" aria-label="Dias anteriores"
                disabled={inicioDias === 0} onClick={() => mudarPaginaDias(Math.max(0, inicioDias - 14))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span aria-live="polite" className="text-sm text-muted-foreground">
                Dias {inicioDias + 1}–{Math.min(inicioDias + 14, totalDias)} de {totalDias}
              </span>
              <Button type="button" variant="outline" size="icon" className="rounded-full" aria-label="Próximos dias"
                disabled={inicioDias + 14 >= totalDias} onClick={() => mudarPaginaDias(Math.min(totalDias - 1, inicioDias + 14))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="w-full min-w-0 pb-1">
            <div data-testid="online-booking-days" role="group" aria-label="Seleção de dias" className="grid w-full min-w-0 grid-cols-7 gap-1 sm:gap-2">
              {dias.map((d) => {
                const dt = parseISO(d);
                const diaCurto = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dt.getDay()];
                const semVaga = !!diasComVaga && !diasComVaga.has(d);
                return (
                  <button key={d} type="button" data-testid="online-booking-day"
                    aria-label={`${format(dt, "EEEE, d 'de' MMMM", { locale: ptBR })}${semVaga ? ', sem vaga' : ''}`}
                    disabled={semVaga && data !== d}
                    aria-pressed={data === d} onClick={() => { liberarReserva(); setData(d); setSlots(null); setHora(''); setErroSlots(''); setErro(''); }}
                    className={cn('flex min-h-14 min-w-0 flex-col items-center rounded-lg border border-border px-0.5 py-2 text-[10px] transition-colors hover:border-primary/50 hover:bg-muted sm:text-xs',
                      semVaga && 'cursor-not-allowed border-dashed text-muted-foreground opacity-50 hover:border-border hover:bg-transparent',
                      data === d && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90')}>
                    <span className="uppercase">{diaCurto}</span>
                    <span className="text-base font-semibold leading-tight sm:text-lg">{format(dt, 'd')}</span>
                    <span>{format(dt, 'MMM', { locale: ptBR })}</span>
                  </button>
                );
              })}
            </div>
            </div>
            {diasComVaga && diasComVaga.size === 0 && (
              <p className="text-sm text-muted-foreground">Sem vagas nestes dias. Veja os próximos dias ou outro profissional.</p>
            )}
            {data && (carregandoSlots ? (
              <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Buscando horários...</div>
            ) : erroSlots ? (
              <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p>{erroSlots}</p>
                <Button type="button" variant="outline" size="sm" className="mt-2 rounded-full" onClick={() => setRecarregar((n) => n + 1)}>Tentar buscar horários novamente</Button>
              </div>
            ) : slots && slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem horários livres neste dia. Tente outro.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {slots?.map((h) => (
                  <Button key={h} type="button" aria-pressed={hora === h} variant={hora === h ? 'default' : 'outline'} size="sm" className={cn('h-10 rounded-lg px-2 tabular-nums', hora === h && 'border-primary bg-primary text-primary-foreground shadow-none hover:bg-primary/90')} disabled={reservandoHora} onClick={() => { void selecionarHorario(h); }}>
                    <Clock className="mr-1 h-3.5 w-3.5" />{h}
                  </Button>
                ))}
              </div>
            ))}
            {reservandoHora && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Reservando este horário por até cinco minutos…</p>}
            {!!holdToken && (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                Horário reservado enquanto você preenche seus dados
                {reservaAte && <> · <span className="font-semibold tabular-nums" aria-label={`restam ${formatarContagem(reservaAte - agoraMs)} minutos`}>{formatarContagem(reservaAte - agoraMs)}</span> restantes</>}.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 3. Seus dados */}
      {hora && (
        <Card ref={etapaDadosRef} className={cn(CARD, 'scroll-mt-4')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">3. Seus dados</CardTitle>
            <CardDescription>{medico?.nome} · {format(parseISO(data), "EEEE, d 'de' MMMM", { locale: ptBR })} às {hora}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ag-nome">Nome completo *</Label>
                <Input id="ag-nome" className={INPUT} required autoComplete="name" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ag-cpf">CPF *</Label>
                <Input id="ag-cpf" className={INPUT} required inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })} placeholder="000.000.000-00" /></div>
              <div className="space-y-1.5"><Label htmlFor="ag-nasc">Data de nascimento</Label>
                <Input id="ag-nasc" className={INPUT} type="date" max={info.hoje} value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ag-tel">Celular / WhatsApp *</Label>
                <Input id="ag-tel" className={INPUT} required inputMode="tel" autoComplete="tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: formatPhone(e.target.value) })} placeholder="(00) 00000-0000" /></div>
              <div className="space-y-1.5"><Label htmlFor="ag-email">E-mail</Label>
                <Input id="ag-email" className={INPUT} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              {/* Honeypot anti-robô: invisível para pessoas. */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden"
                value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <Checkbox checked={aceite} onCheckedChange={(v) => setAceite(v === true)} className="mt-0.5" />
                <span>Autorizo a clínica a usar estes dados para o agendamento e contato, conforme a{' '}
                  <Link to="/politica-privacidade" target="_blank" className="text-primary underline">política de privacidade</Link>.</span>
              </label>
              {erro && <p className="text-sm text-destructive sm:col-span-2" role="alert">{erro}</p>}
              <Button type="submit" aria-describedby={!aceite || !holdToken ? 'ag-motivo-bloqueio' : undefined} className={cn('h-12 sm:col-span-2', BTN_PRIMARY)} disabled={enviando || !aceite || !holdToken}>
                {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarCheck className="mr-2 h-4 w-4" />}
                Solicitar agendamento
              </Button>
              {/* O botão desabilitado diz por quê, em vez de só ficar cinza. */}
              {(!aceite || !holdToken) && !enviando && (
                <p id="ag-motivo-bloqueio" className="text-center text-xs text-muted-foreground sm:col-span-2">
                  {!holdToken ? 'A reserva do horário terminou. Escolha o horário de novo.' : 'Marque a autorização de uso dos dados para enviar o pedido.'}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      )}
      {erro && !hora && <p ref={erroRef} tabIndex={-1} className="text-sm text-destructive" role="alert">{erro}</p>}
      </fieldset>
    </Shell>
  );
}

function Shell({ titulo, subtitulo, children }: { titulo?: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:py-10">
        {titulo && (
          <header className="mb-2 border-b border-border pb-4">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
              <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />Agendamento online
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{titulo}</h1>
            {subtitulo && <p className="mt-1 text-sm leading-6 text-muted-foreground">{subtitulo}</p>}
          </header>
        )}
        {children}
        <Link to="/" className="flex min-h-10 items-center justify-center gap-1 pt-4 text-xs text-muted-foreground hover:text-foreground">
          Agendamento por <Logo className="origin-left scale-75" />
        </Link>
      </div>
    </div>
  );
}
