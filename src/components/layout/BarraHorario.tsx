import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, ClipboardCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useAgendamentos } from '@/hooks/useSupabaseData';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { primeiroNome } from '@/lib/formatters';
import { formatAppointmentStatus } from '@/components/dashboard/appointmentStatus';
import { cn } from '@/lib/utils';

interface Pessoa { nome: string | null; foto_url?: string | null }
interface Consulta {
  id: string;
  medico_id: string;
  hora_inicio: string;
  hora_fim: string | null;
  status: string;
  tipo: string;
  pacientes?: Pessoa | null;
  medicos?: (Pessoa & { intervalo_consulta?: number | null }) | null;
}

const STATUS_FORA = new Set(['cancelado', 'faltou']);

function minutos(hora: string) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + (m || 0);
}

function agoraEmMinutosSP(instant: Date) {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const h = Number(partes.find(p => p.type === 'hour')?.value ?? 0);
  const m = Number(partes.find(p => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

function useAgoraSP() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return agoraEmMinutosSP(agora);
}

function inicial(nome: string | null | undefined) {
  return primeiroNome(nome).charAt(0).toUpperCase() || '·';
}

function Foto({ pessoa, className }: { pessoa?: Pessoa | null; className?: string }) {
  return (
    <Avatar className={cn('h-7 w-7 ring-2 ring-white/90', className)}>
      {pessoa?.foto_url && <AvatarImage src={pessoa.foto_url} alt="" />}
      <AvatarFallback className="bg-gradient-to-br from-[#d9c3a5] to-[#8c6a4f] text-[10px] font-semibold text-white">
        {inicial(pessoa?.nome)}
      </AvatarFallback>
    </Avatar>
  );
}

function Segmento({ consulta, atual, rotulo }: { consulta: Consulta | null; atual?: boolean; rotulo: string }) {
  const horario = consulta ? `${consulta.hora_inicio.slice(0, 5)}${consulta.hora_fim ? `–${consulta.hora_fim.slice(0, 5)}` : ''}` : null;
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2.5 rounded-full px-3 py-1.5 transition-colors',
        atual ? 'bg-gradient-primary text-white shadow-[0_4px_14px_rgba(16,128,202,0.45)]' : 'text-white/80',
        !atual && 'hidden md:flex',
      )}
    >
      {consulta ? (
        <>
          <div className="flex shrink-0 -space-x-2">
            <Foto pessoa={consulta.medicos} />
            <Foto pessoa={consulta.pacientes} />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold">{primeiroNome(consulta.pacientes?.nome) || 'Paciente'}</p>
            <p className={cn('truncate text-[11px]', atual ? 'text-white/85' : 'text-white/55')}>
              {horario} · {formatAppointmentStatus(consulta.status)}
            </p>
          </div>
        </>
      ) : (
        <p className={cn('truncate text-[12px]', atual ? 'font-semibold text-white' : 'text-white/45')}>{rotulo}</p>
      )}
      {atual && (
        <span className="ml-auto shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
          Agora
        </span>
      )}
    </div>
  );
}

export function BarraHorario() {
  const { profile } = useSupabaseAuth();
  const { medicoId, isMedicoOnly } = useCurrentMedico();
  const hoje = todaySaoPauloDateOnly();
  const agora = useAgoraSP();
  const { data, isLoading } = useAgendamentos(hoje, { enabled: !!profile?.clinica_id });

  const consultas = useMemo(() => {
    const lista = ((data ?? []) as unknown as Consulta[])
      .filter(c => !STATUS_FORA.has(c.status))
      .filter(c => !isMedicoOnly || !medicoId || c.medico_id === medicoId);
    return lista.sort((a, b) => minutos(a.hora_inicio) - minutos(b.hora_inicio));
  }, [data, isMedicoOnly, medicoId]);

  const { anterior, atual, proxima } = useMemo(() => {
    const fim = (c: Consulta) => c.hora_fim ? minutos(c.hora_fim) : minutos(c.hora_inicio) + (c.medicos?.intervalo_consulta || 30);
    const emCurso = consultas.find(c => minutos(c.hora_inicio) <= agora && agora < fim(c)) ?? null;
    const referencia = emCurso ? minutos(emCurso.hora_inicio) : agora;
    const passadas = consultas.filter(c => c !== emCurso && fim(c) <= referencia);
    const futuras = consultas.filter(c => c !== emCurso && minutos(c.hora_inicio) >= (emCurso ? fim(emCurso) : agora));
    return { anterior: passadas.at(-1) ?? null, atual: emCurso, proxima: futuras[0] ?? null };
  }, [consultas, agora]);

  if (!profile?.clinica_id) return null;

  const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short',
  }).format(new Date());

  return (
    <section
      aria-label="Agenda de hoje"
      aria-busy={isLoading}
      className="mb-4 flex items-center gap-2 rounded-full bg-[#171717] p-1.5 pl-4 text-white shadow-md"
    >
      <div className="hidden shrink-0 leading-tight sm:block">
        <p className="text-[13px] font-semibold">{isMedicoOnly ? 'Sua agenda' : 'Agenda de hoje'}</p>
        <p className="text-[11px] capitalize text-white/50">{dataFormatada} · {consultas.length} consulta{consultas.length === 1 ? '' : 's'}</p>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1 sm:ml-2">
        {isLoading ? (
          <div className="h-10 flex-1 animate-pulse rounded-full bg-white/10" />
        ) : (
          <>
            <Segmento consulta={anterior} rotulo="Nenhuma consulta anterior" />
            <Segmento consulta={atual} atual rotulo={consultas.length ? 'Sem consulta em andamento' : 'Sem consultas hoje'} />
            <Segmento consulta={proxima} rotulo="Nenhuma próxima consulta" />
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to="/fila" aria-label="Abrir fila de atendimento" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white">
              <ClipboardCheck className="h-4 w-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom">Fila de atendimento</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to="/agenda" aria-label="Abrir agenda completa" className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#171717] transition-colors hover:bg-white/90">
              <CalendarRange className="h-4 w-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom">Agenda completa</TooltipContent>
        </Tooltip>
      </div>
    </section>
  );
}
