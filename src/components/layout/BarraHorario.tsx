import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useAgendamentosPeriodo } from '@/hooks/useSupabaseData';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { parseDateOnly, toDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { primeiroNome } from '@/lib/formatters';
import { formatAppointmentStatus } from '@/components/dashboard/appointmentStatus';
import { cn } from '@/lib/utils';

interface Pessoa { nome: string | null; foto_url?: string | null }
interface Consulta {
  id: string;
  medico_id: string;
  data: string;
  hora_inicio: string;
  hora_fim: string | null;
  status: string;
  pacientes?: Pessoa | null;
  medicos?: (Pessoa & { intervalo_consulta?: number | null }) | null;
}

const STATUS_FORA = new Set(['cancelado', 'faltou']);
const DIAS_A_FRENTE = 30;

function minutos(hora: string) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + (m || 0);
}

function fimEmMinutos(c: Consulta) {
  return c.hora_fim ? minutos(c.hora_fim) : minutos(c.hora_inicio) + (c.medicos?.intervalo_consulta || 30);
}

function agoraEmMinutosSP(instant: Date) {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const h = Number(partes.find(p => p.type === 'hour')?.value ?? 0);
  const m = Number(partes.find(p => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

function useRelogioSP() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return { hoje: todaySaoPauloDateOnly(agora), minutosAgora: agoraEmMinutosSP(agora) };
}

function rotuloDia(data: string, hoje: string) {
  if (data === hoje) return '';
  const amanha = parseDateOnly(hoje);
  amanha.setDate(amanha.getDate() + 1);
  if (data === toDateOnly(amanha)) return 'Amanhã ';
  return `${new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(parseDateOnly(data))} `;
}

function Foto({ pessoa }: { pessoa?: Pessoa | null }) {
  const inicial = primeiroNome(pessoa?.nome).charAt(0).toUpperCase() || '·';
  return (
    <Avatar className="h-6 w-6 ring-2 ring-brand-dark">
      {pessoa?.foto_url && <AvatarImage src={pessoa.foto_url} alt="" />}
      <AvatarFallback className="bg-secondary text-[9px] font-semibold text-foreground">{inicial}</AvatarFallback>
    </Avatar>
  );
}

function Segmento({ consulta, hoje, atual, vazio, className }: {
  consulta: Consulta | null; hoje: string; atual?: boolean; vazio: string; className?: string;
}) {
  const detalhe = consulta
    ? consulta.data === hoje
      ? `${consulta.hora_inicio.slice(0, 5)} · ${formatAppointmentStatus(consulta.status)}`
      : `${rotuloDia(consulta.data, hoje)}${consulta.hora_inicio.slice(0, 5)}`
    : null;
  return (
    <Link
      to="/agenda"
      className={cn(
        'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full px-2.5 transition-colors',
        atual
          ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
          : 'text-white/75 hover:bg-white/10',
        className,
      )}
    >
      {consulta ? (
        <>
          <div className="flex shrink-0 -space-x-1.5">
            <Foto pessoa={consulta.medicos} />
            <Foto pessoa={consulta.pacientes} />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[12px] font-semibold">{primeiroNome(consulta.pacientes?.nome) || 'Paciente'}</p>
            <p className={cn('truncate text-[10px] capitalize', atual ? 'text-white/85' : 'text-white/50')}>{detalhe}</p>
          </div>
        </>
      ) : (
        <p className={cn('truncate text-[11px]', atual ? 'font-semibold text-white' : 'text-white/40')}>{vazio}</p>
      )}
      {atual && (
        <span className="ml-auto shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">Agora</span>
      )}
    </Link>
  );
}

export function BarraHorario() {
  const { profile } = useSupabaseAuth();
  const { medicoId, isMedicoOnly } = useCurrentMedico();
  const { hoje, minutosAgora } = useRelogioSP();
  const limite = useMemo(() => {
    const d = parseDateOnly(hoje);
    d.setDate(d.getDate() + DIAS_A_FRENTE);
    return toDateOnly(d);
  }, [hoje]);
  const { data, isLoading } = useAgendamentosPeriodo(hoje, limite, { enabled: !!profile?.clinica_id, keepPrevious: true });

  const consultas = useMemo(() => (
    ((data ?? []) as Consulta[])
      .filter(c => !STATUS_FORA.has(c.status))
      .filter(c => !isMedicoOnly || !medicoId || c.medico_id === medicoId)
      .sort((a, b) => a.data.localeCompare(b.data) || minutos(a.hora_inicio) - minutos(b.hora_inicio))
  ), [data, isMedicoOnly, medicoId]);

  const { atual, proxima, totalHoje } = useMemo(() => {
    const deHoje = consultas.filter(c => c.data === hoje);
    const emCurso = deHoje.find(c => minutos(c.hora_inicio) <= minutosAgora && minutosAgora < fimEmMinutos(c)) ?? null;
    const inicioFuturo = emCurso ? fimEmMinutos(emCurso) : minutosAgora;
    const futuras = consultas.filter(c => c !== emCurso && (c.data > hoje || minutos(c.hora_inicio) >= inicioFuturo));
    return { atual: emCurso, proxima: futuras[0] ?? null, totalHoje: deHoje.length };
  }, [consultas, hoje, minutosAgora]);

  if (!profile?.clinica_id) return null;

  const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short',
  }).format(new Date());

  return (
    <section
      aria-label="Agenda de hoje"
      aria-busy={isLoading}
      className="flex h-11 min-w-0 items-center gap-1 rounded-full bg-brand-dark p-1 pl-3 text-white shadow-sm"
    >
      <div className="hidden shrink-0 pr-2 leading-tight 2xl:block">
        <p className="text-[12px] font-semibold">{isMedicoOnly ? 'Sua agenda' : 'Hoje'}</p>
        <p className="text-[10px] capitalize text-white/50">{dataFormatada} · {totalHoje} consulta{totalHoje === 1 ? '' : 's'}</p>
      </div>
      {isLoading && !data ? (
        <div className="h-9 flex-1 animate-pulse rounded-full bg-white/10" />
      ) : (
        <>
          <Segmento consulta={atual} hoje={hoje} atual vazio={totalHoje ? 'Sem consulta' : 'Sem consultas'} />
          <Segmento consulta={proxima} hoje={hoje} vazio="Nenhuma próxima" className="hidden lg:flex" />
        </>
      )}
    </section>
  );
}
