import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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

const STATUS_FORA = ['cancelado', 'faltou'];
const DIAS_A_FRENTE = 30;
const CAMPOS = 'id, medico_id, data, hora_inicio, hora_fim, status, pacientes(nome, foto_url), medicos(nome, foto_url, intervalo_consulta)';
const MEDIA_DESKTOP = '(min-width: 1024px)';

/** A barra só aparece a partir de 1024 px; abaixo disso não consulta nada. */
function useTelaGrande() {
  const consultar = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(MEDIA_DESKTOP).matches;
  const [grande, setGrande] = useState(consultar);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(MEDIA_DESKTOP);
    const atualizar = () => setGrande(media.matches);
    atualizar();
    media.addEventListener?.('change', atualizar);
    return () => media.removeEventListener?.('change', atualizar);
  }, []);
  return grande;
}

/**
 * Consulta própria e leve: as consultas de hoje e só a próxima depois de hoje,
 * com poucos campos. Antes a barra carregava 30 dias de agendamentos com o
 * cadastro completo dos pacientes em todas as telas, inclusive no celular.
 * A chave começa com 'agendamentos' para o realtime global invalidá-la.
 */
function useAgendaDaBarra(hoje: string, limite: string, medicoId: string | null, enabled: boolean) {
  const { user, profile } = useSupabaseAuth();
  return useQuery({
    queryKey: ['agendamentos', 'barra-horario', user?.id ?? null, profile?.clinica_id ?? null, hoje, medicoId],
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    meta: { suppressGlobalErrorToast: true },
    queryFn: async () => {
      const base = () => {
        let consulta = supabase.from('agendamentos').select(CAMPOS).not('status', 'in', `(${STATUS_FORA.join(',')})`);
        if (medicoId) consulta = consulta.eq('medico_id', medicoId);
        return consulta;
      };
      const [deHoje, seguintes] = await Promise.all([
        base().eq('data', hoje).order('hora_inicio', { ascending: true }),
        base().gt('data', hoje).lte('data', limite).order('data', { ascending: true }).order('hora_inicio', { ascending: true }).limit(1),
      ]);
      if (deHoje.error) throw deHoje.error;
      if (seguintes.error) throw seguintes.error;
      return [...(deHoje.data ?? []), ...(seguintes.data ?? [])] as unknown as Consulta[];
    },
  });
}

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
    <Avatar className="h-6 w-6 ring-2 ring-card">
      {pessoa?.foto_url && <AvatarImage src={pessoa.foto_url} alt="" />}
      <AvatarFallback className="bg-secondary text-[11px] font-semibold text-foreground">{inicial}</AvatarFallback>
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
        'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 transition-colors',
        atual
          ? 'bg-accent text-foreground hover:bg-secondary'
          : 'text-muted-foreground hover:bg-secondary',
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
            <p className={cn('truncate text-[11px] capitalize', atual ? 'text-foreground' : 'text-muted-foreground')}>{detalhe}</p>
          </div>
        </>
      ) : (
        <p className={cn('truncate text-[11px]', atual ? 'font-medium text-foreground' : 'text-muted-foreground')}>{vazio}</p>
      )}
      {atual && (
        <span className="ml-auto shrink-0 rounded bg-card px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-normal">Agora</span>
      )}
    </Link>
  );
}

export function BarraHorario() {
  const { profile } = useSupabaseAuth();
  const telaGrande = useTelaGrande();
  const { medicoId, isMedicoOnly } = useCurrentMedico();
  const { hoje, minutosAgora } = useRelogioSP();
  const limite = useMemo(() => {
    const d = parseDateOnly(hoje);
    d.setDate(d.getDate() + DIAS_A_FRENTE);
    return toDateOnly(d);
  }, [hoje]);
  const filtroMedico = isMedicoOnly && medicoId ? medicoId : null;
  const { data, isLoading } = useAgendaDaBarra(hoje, limite, filtroMedico, telaGrande && !!profile?.clinica_id);

  const consultas = useMemo(() => (
    (data ?? [])
      .filter(c => !STATUS_FORA.includes(c.status))
      .filter(c => !isMedicoOnly || !medicoId || c.medico_id === medicoId)
      .filter(c => typeof c.data === 'string')
      .sort((a, b) => a.data.localeCompare(b.data) || minutos(a.hora_inicio) - minutos(b.hora_inicio))
  ), [data, isMedicoOnly, medicoId]);

  const { atual, proxima, totalHoje } = useMemo(() => {
    const deHoje = consultas.filter(c => c.data === hoje);
    const emCurso = deHoje.find(c => minutos(c.hora_inicio) <= minutosAgora && minutosAgora < fimEmMinutos(c)) ?? null;
    const inicioFuturo = emCurso ? fimEmMinutos(emCurso) : minutosAgora;
    const futuras = consultas.filter(c => c !== emCurso && (c.data > hoje || minutos(c.hora_inicio) >= inicioFuturo));
    return { atual: emCurso, proxima: futuras[0] ?? null, totalHoje: deHoje.length };
  }, [consultas, hoje, minutosAgora]);

  if (!profile?.clinica_id || !telaGrande) return null;

  const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short',
  }).format(new Date());

  return (
    <section
      aria-label="Agenda de hoje"
      aria-busy={isLoading}
      className="agenda-toolbar flex h-11 min-w-0 items-center gap-1 rounded-lg border border-border bg-card p-1 pl-3 text-foreground"
    >
      <div className="agenda-toolbar-date shrink-0 pr-2 leading-tight">
        <p className="text-[12px] font-semibold">{isMedicoOnly ? 'Sua agenda' : 'Hoje'}</p>
        <p className="text-[11px] capitalize text-muted-foreground">{dataFormatada} · {totalHoje} consulta{totalHoje === 1 ? '' : 's'}</p>
      </div>
      {isLoading && !data ? (
        <div className="h-9 flex-1 animate-pulse rounded-md bg-muted" />
      ) : (
        <>
          <Segmento consulta={atual} hoje={hoje} atual vazio={totalHoje ? 'Sem consulta' : 'Sem consultas'} />
          <Segmento consulta={proxima} hoje={hoje} vazio="Nenhuma próxima" className="agenda-toolbar-next" />
        </>
      )}
    </section>
  );
}
