import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, Stethoscope } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCPF, formatPhone, validateCPF } from '@/lib/formatters';

interface Medico { id: string; nome: string; especialidade: string | null }
interface Info { clinica: { nome: string }; mensagem: string | null; medicos: Medico[]; dias_antecedencia: number; hoje: string }

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
  const [form, setForm] = useState({ nome: '', cpf: '', telefone: '', email: '', data_nascimento: '', website: '' });
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [concluido, setConcluido] = useState('');
  const [recarregar, setRecarregar] = useState(0);
  const [recarregarInfo, setRecarregarInfo] = useState(0);
  const sucessoRef = useRef<HTMLDivElement>(null);
  const erroRef = useRef<HTMLParagraphElement>(null);

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

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medico || !data || !hora) return;
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
    setEnviando(true); setErro('');
    try {
      const r = await chamar<{ message: string }>({
        action: 'book', clinica_id: clinicaId, medico_id: medico.id, data, hora,
        ...form, aceite_lgpd: aceite,
      });
      setConcluido(r.message);
    } catch (err) {
      const erro = err instanceof Error ? err : new Error('Não foi possível concluir agora. Tente novamente.');
      setErro(erro.message);
      if (erro instanceof ErroAgendamentoPublico && erro.code === 'slot_unavailable') {
        setHora('');
        setRecarregar((n) => n + 1);
      }
    } finally {
      setEnviando(false);
    }
  };

  if (erroInfo) {
    return (
      <Shell>
        <Card><CardContent className="py-12 text-center">
          <CalendarCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p role="alert" className="font-medium">{erroInfo}</p>
          <p className="mt-1 text-sm text-muted-foreground">Entre em contato com a clínica por telefone ou WhatsApp.</p>
          <Button className="mt-4" onClick={() => { setErroInfo(''); setRecarregarInfo((n) => n + 1); }}>Tentar novamente</Button>
        </CardContent></Card>
      </Shell>
    );
  }
  if (!info) return <Shell><div role="status" aria-live="polite" aria-label="Carregando informações da clínica"><Skeleton className="h-10 w-2/3" /><Skeleton className="mt-4 h-64 w-full" /></div></Shell>;

  if (concluido) {
    return (
      <Shell titulo={info.clinica.nome}>
        <Card><CardContent ref={sucessoRef} tabIndex={-1} role="status" aria-live="polite" className="py-12 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-success" />
          <p className="text-lg font-semibold">{concluido}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {medico?.nome} · {format(parseISO(data), "EEEE, d 'de' MMMM", { locale: ptBR })} às {hora}
          </p>
        </CardContent></Card>
      </Shell>
    );
  }

  return (
    <Shell titulo={info.clinica.nome} subtitulo={info.mensagem || 'Escolha o profissional, o dia e o horário.'}>
      {/* 1. Profissional */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">1. Profissional</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {info.medicos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum profissional com agenda online no momento.</p>}
          {info.medicos.map((m) => (
            <button key={m.id} type="button" aria-pressed={medico?.id === m.id} onClick={() => { setMedico(m); setData(''); setSlots(null); setHora(''); setErro(''); }}
              className={cn('flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50',
                medico?.id === m.id && 'border-primary bg-primary/5 ring-1 ring-primary')}>
              <Stethoscope className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0"><span className="block truncate font-medium">{m.nome}</span>
                {m.especialidade && <span className="block truncate text-xs text-muted-foreground">{m.especialidade}</span>}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* 2. Dia e horário */}
      {medico && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">2. Dia e horário</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" size="icon" aria-label="Dias anteriores"
                disabled={inicioDias === 0} onClick={() => mudarPaginaDias(Math.max(0, inicioDias - 14))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span aria-live="polite" className="text-sm text-muted-foreground">
                Dias {inicioDias + 1}–{Math.min(inicioDias + 14, totalDias)} de {totalDias}
              </span>
              <Button type="button" variant="ghost" size="icon" aria-label="Próximos dias"
                disabled={inicioDias + 14 >= totalDias} onClick={() => mudarPaginaDias(Math.min(totalDias - 1, inicioDias + 14))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div data-testid="online-booking-days" className="grid grid-cols-7 gap-1 sm:gap-2">
              {dias.map((d) => {
                const dt = parseISO(d);
                const diaCurto = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dt.getDay()];
                return (
                  <button key={d} type="button" data-testid="online-booking-day"
                    aria-label={format(dt, "EEEE, d 'de' MMMM", { locale: ptBR })}
                    aria-pressed={data === d} onClick={() => { setData(d); setErro(''); }}
                    className={cn('flex min-w-0 flex-col items-center rounded-lg border px-0.5 py-2 text-[10px] transition-colors hover:bg-accent/50 sm:text-xs',
                      data === d && 'border-primary bg-primary text-primary-foreground hover:bg-primary')}>
                    <span className="uppercase">{diaCurto}</span>
                    <span className="text-base font-semibold leading-tight sm:text-lg">{format(dt, 'd')}</span>
                    <span>{format(dt, 'MMM', { locale: ptBR })}</span>
                  </button>
                );
              })}
            </div>
            {data && (carregandoSlots ? (
              <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Buscando horários...</div>
            ) : erroSlots ? (
              <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p>{erroSlots}</p>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setRecarregar((n) => n + 1)}>Tentar buscar horários novamente</Button>
              </div>
            ) : slots && slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem horários livres neste dia. Tente outro.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {slots?.map((h) => (
                  <Button key={h} type="button" aria-pressed={hora === h} variant={hora === h ? 'default' : 'outline'} size="sm" onClick={() => { setHora(h); setErro(''); }}>
                    <Clock className="mr-1 h-3.5 w-3.5" />{h}
                  </Button>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 3. Seus dados */}
      {hora && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">3. Seus dados</CardTitle>
            <CardDescription>{medico?.nome} · {format(parseISO(data), "EEEE, d 'de' MMMM", { locale: ptBR })} às {hora}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ag-nome">Nome completo *</Label>
                <Input id="ag-nome" required autoComplete="name" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ag-cpf">CPF *</Label>
                <Input id="ag-cpf" required inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })} placeholder="000.000.000-00" /></div>
              <div className="space-y-1.5"><Label htmlFor="ag-nasc">Data de nascimento</Label>
                <Input id="ag-nasc" type="date" max={info.hoje} value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ag-tel">Celular / WhatsApp *</Label>
                <Input id="ag-tel" required inputMode="tel" autoComplete="tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: formatPhone(e.target.value) })} placeholder="(00) 00000-0000" /></div>
              <div className="space-y-1.5"><Label htmlFor="ag-email">E-mail</Label>
                <Input id="ag-email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              {/* Honeypot anti-robô: invisível para pessoas. */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden"
                value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <Checkbox checked={aceite} onCheckedChange={(v) => setAceite(v === true)} className="mt-0.5" />
                <span>Autorizo a clínica a usar estes dados para o agendamento e contato, conforme a{' '}
                  <Link to="/politica-privacidade" target="_blank" className="text-primary underline">política de privacidade</Link>.</span>
              </label>
              {erro && <p className="text-sm text-destructive sm:col-span-2" role="alert">{erro}</p>}
              <Button type="submit" className="sm:col-span-2" disabled={enviando || !aceite}>
                {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarCheck className="mr-2 h-4 w-4" />}
                Solicitar agendamento
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      {erro && !hora && <p ref={erroRef} tabIndex={-1} className="text-sm text-destructive" role="alert">{erro}</p>}
    </Shell>
  );
}

function Shell({ titulo, subtitulo, children }: { titulo?: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        {titulo && (
          <header className="mb-2">
            <p className="text-xs text-muted-foreground">Agendamento online</p>
            <h1 className="text-2xl font-bold">{titulo}</h1>
            {subtitulo && <p className="text-sm text-muted-foreground">{subtitulo}</p>}
          </header>
        )}
        {children}
        <p className="pt-4 text-center text-xs text-muted-foreground">Agendamento por EloLab</p>
      </div>
    </div>
  );
}
