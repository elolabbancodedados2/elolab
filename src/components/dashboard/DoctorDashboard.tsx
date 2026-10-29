import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { format, parseISO, differenceInYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatWithDatePreference } from '@/lib/datePreference';
import {
  Calendar, Users, FileText, Pill, Clock, Stethoscope, ClipboardList,
  ArrowRight, Activity, Target,
  Sun, Sunset, Moon, CheckCircle2, AlertTriangle, Eye, UserCheck,
  TestTube, Send, BadgeCheck, Phone, Timer, Zap, ListChecks,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAgendamentosPeriodo, useMinhasTarefasPendentes } from '@/hooks/useSupabaseData';
import { StorageAvatarImage } from '@/components/StorageImage';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { DashboardSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { isAppointmentClosed } from '@/components/dashboard/appointmentStatus';

// ─── Animations ────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.04, duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };

function LiveClockComponent() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(time);
  return <span className="tabular-nums font-semibold text-lg tracking-tight">{hora}</span>;
}

/** Pacientes distintos já atendidos/agendados com o médico. Lê só a coluna paciente_id, em blocos. */
async function contarPacientesDoMedico(medicoId: string, clinicaId: string): Promise<number> {
  const ids = new Set<string>();
  const BLOCO = 1000;
  for (let inicio = 0; inicio < 50_000; inicio += BLOCO) {
    const { data, error } = await (supabase as any).from('agendamentos').select('paciente_id')
      .eq('clinica_id', clinicaId).eq('medico_id', medicoId).order('id').range(inicio, inicio + BLOCO - 1);
    if (error) throw error;
    for (const r of data ?? []) if (r.paciente_id) ids.add(r.paciente_id);
    if (!data || data.length < BLOCO) break;
  }
  return ids.size;
}

interface DoctorDashboardProps {
  userName: string;
}

export function DoctorDashboardKpiLink({ href, children, className }: { href: string | null; children: ReactNode; className?: string }) {
  return href ? <Link to={href} className={className}>{children}</Link> : <div className={className}>{children}</div>;
}

export function DoctorDashboardIdentityState({
  isLoading = false,
  error,
  medicoId,
  onRetry,
}: {
  isLoading?: boolean;
  error?: unknown;
  medicoId: string | null;
  onRetry: () => void;
}) {
  if (isLoading) return <DashboardSkeleton />;
  if (error) {
    return (
      <ErrorState
        title="Não foi possível carregar seu cadastro profissional"
        error={error}
        onRetry={onRetry}
      />
    );
  }
  if (medicoId) return null;

  return (
    <Card role="status" className="border-border bg-card p-6 shadow-none sm:p-8">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Stethoscope className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-card-foreground">Cadastro profissional não vinculado</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Não encontramos um cadastro médico associado a esta conta. Peça ao administrador da clínica para concluir o vínculo e depois tente novamente.
          </p>
        </div>
        <Button variant="outline" onClick={onRetry} className="rounded-xl border-border text-primary">
          Tentar novamente
        </Button>
      </div>
    </Card>
  );
}

export function DoctorDashboard({ userName }: DoctorDashboardProps) {
  const {
    currentMedico,
    medicoId,
    isLoading: currentMedicoLoading,
    error: currentMedicoError,
    refetch: refetchCurrentMedico,
  } = useCurrentMedico();
  const { user, profile } = useSupabaseAuth();
  const hoje = todaySaoPauloDateOnly();
  const amanhaDate = new Date(`${hoje}T00:00:00Z`);
  amanhaDate.setUTCDate(amanhaDate.getUTCDate() + 1);
  const amanha = amanhaDate.toISOString().slice(0, 10);
  const inicioMes = `${hoje.slice(0, 7)}-01`;

  // Só hoje e amanhã, já com o paciente. Antes o painel baixava a agenda,
  // o cadastro de pacientes, prontuários e prescrições da clínica inteira
  // para filtrar o médico no navegador.
  const agendamentosQuery = useAgendamentosPeriodo(hoje, amanha, { enabled: !!medicoId, suppressGlobalErrorToast: true });
  const { data: agendamentos = [] } = agendamentosQuery;
  const { data: minhasTarefas = [] } = useMinhasTarefasPendentes();

  const contagensQuery = useQuery({
    queryKey: ['doctor-dashboard-contagens', user?.id ?? null, profile?.clinica_id ?? null, medicoId, inicioMes],
    meta: { suppressGlobalErrorToast: true },
    enabled: !!medicoId && !!user && !!profile?.clinica_id,
    staleTime: 60_000,
    queryFn: async () => {
      const contar = async (tabela: string, colunaMedico: string, colunaData: string, extra?: (q: any) => any) => {
        let q = (supabase as any).from(tabela).select('id', { count: 'exact', head: true })
          .eq('clinica_id', profile!.clinica_id!).eq(colunaMedico, medicoId).gte(colunaData, inicioMes);
        if (extra) q = extra(q);
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
      };
      const [prontuariosMes, prescricoesMes, atestadosMes, examesMes, encaminhamentosMes, atendimentosMes, pacientesRes] = await Promise.all([
        contar('prontuarios', 'medico_id', 'data'),
        contar('prescricoes', 'medico_id', 'data_emissao'),
        contar('atestados', 'medico_id', 'data_emissao'),
        contar('exames', 'medico_solicitante_id', 'data_solicitacao'),
        contar('encaminhamentos', 'medico_origem_id', 'data_encaminhamento'),
        contar('agendamentos', 'medico_id', 'data', (q) => q.in('status', ['finalizado', 'atendimento_finalizado']).lte('data', hoje)),
        contarPacientesDoMedico(medicoId as string, profile!.clinica_id!),
      ]);
      return {
        prontuariosMes, prescricoesMes, atestadosMes, examesMes, encaminhamentosMes, atendimentosMes,
        meusPacientes: pacientesRes,
      };
    },
  });
  const { data: contagens } = contagensQuery;
  const hojeFormatado = format(parseDateOnly(hoje)!, "EEEE, d 'de' MMMM", { locale: ptBR });
  const horaAtual = Number(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23',
  }).format(new Date()));
  const saudacao = horaAtual < 12 ? 'Bom dia' : horaAtual < 18 ? 'Boa tarde' : 'Boa noite';
  const SaudacaoIcon = horaAtual < 12 ? Sun : horaAtual < 18 ? Sunset : Moon;
  // O nome cadastrado costuma trazer o título ("Dr. Carlos"): sem tirá-lo, a
  // saudação virava "Dr(a). Dr.".
  const firstName = userName?.replace(/^(dr|dra|dr\(a\))\.?\s+/i, '').split(' ')[0] || 'Doutor(a)';

  const stats = useMemo(() => {
    const consultasHoje = agendamentos.filter((a: any) => a.data === hoje && a.medico_id === medicoId);
    const confirmadas = consultasHoje.filter((a: any) => a.status === 'confirmado').length;
    const agendadas = consultasHoje.filter((a: any) => a.status === 'agendado').length;
    const finalizadas = consultasHoje.filter((a: any) => a.status === 'finalizado' || a.status === 'atendimento_finalizado').length;
    const emAtendimento = consultasHoje.filter((a: any) => a.status === 'em_atendimento').length;
    const canceladasHoje = consultasHoje.filter((a: any) => a.status === 'cancelado').length;
    const totalHoje = consultasHoje.length - canceladasHoje;

    const proximasHoje = consultasHoje
      .filter((a: any) => !['finalizado', 'atendimento_finalizado', 'cancelado', 'faltou'].includes(a.status))
      .sort((a: any, b: any) => a.hora_inicio.localeCompare(b.hora_inicio));

    const consultasAmanha = agendamentos.filter((a: any) => a.data === amanha && a.medico_id === medicoId && a.status !== 'cancelado').length;

    const proximaConsulta = proximasHoje[0] || null;
    const proximoPaciente = proximaConsulta?.pacientes ?? null;

    return {
      totalHoje, canceladasHoje, confirmadas, agendadas, finalizadas, emAtendimento,
      prontuariosMes: contagens?.prontuariosMes ?? 0,
      prescricoesMes: contagens?.prescricoesMes ?? 0,
      atendimentosMes: contagens?.atendimentosMes ?? 0,
      meusPacientes: contagens?.meusPacientes ?? 0,
      atestadosMes: contagens?.atestadosMes ?? 0,
      examesMes: contagens?.examesMes ?? 0,
      encaminhamentosMes: contagens?.encaminhamentosMes ?? 0,
      proximasHoje, consultasAmanha,
      proximaConsulta, proximoPaciente,
      consultasHoje,
    };
  }, [agendamentos, contagens, medicoId, hoje, amanha]);

  const getAge = (dob: string | null) => {
    if (!dob) return null;
    try { return differenceInYears(new Date(), parseISO(dob)); } catch { return null; }
  };

  const getPacienteNome = (pacienteId: string) => {
    const p = agendamentos.find((a: any) => a.paciente_id === pacienteId)?.pacientes;
    return p?.nome || 'Paciente';
  };

  const statusColor: Record<string, string> = {
    agendado: 'bg-info/10 text-info border-info/20',
    confirmado: 'bg-success/10 text-success border-success/20',
    em_atendimento: 'bg-primary/10 text-primary border-primary/20',
    aguardando: 'bg-warning/10 text-warning border-warning/20',
    aguardando_triagem: 'bg-warning/10 text-warning border-warning/20',
    em_triagem: 'bg-info/10 text-info border-info/20',
    finalizado: 'bg-muted text-muted-foreground',
    aguardando_pagamento: 'bg-warning/10 text-warning border-warning/20',
    pago: 'bg-success/10 text-success border-success/20',
    atendimento_finalizado: 'bg-muted text-muted-foreground',
    aguardando_pagamento_adicional: 'bg-destructive/10 text-destructive border-destructive/20',
    cancelado: 'bg-muted text-muted-foreground line-through',
    faltou: 'bg-destructive/10 text-destructive border-destructive/20',
  };

  const statusLabel: Record<string, string> = {
    agendado: 'Agendado',
    confirmado: 'Confirmado',
    em_atendimento: 'Em Atendimento',
    aguardando: 'Aguardando',
    aguardando_triagem: 'Aguardando triagem',
    em_triagem: 'Em triagem',
    finalizado: 'Finalizado',
    cancelado: 'Cancelado',
    faltou: 'Faltou',
    aguardando_pagamento: 'Aguardando pagamento',
    pago: 'Pago',
    atendimento_finalizado: 'Atendimento finalizado',
    aguardando_pagamento_adicional: 'Falta pagar o adicional',
  };

  if (currentMedicoLoading || currentMedicoError || !medicoId) {
    return (
      <DoctorDashboardIdentityState
        isLoading={currentMedicoLoading}
        error={currentMedicoError}
        medicoId={medicoId}
        onRetry={() => { void refetchCurrentMedico(); }}
      />
    );
  }

  if (agendamentosQuery.isError || contagensQuery.isError) {
    const error = agendamentosQuery.error || contagensQuery.error;
    return (
      <ErrorState
        title="Não foi possível carregar o painel médico"
        error={error}
        onRetry={() => { void Promise.all([agendamentosQuery.refetch(), contagensQuery.refetch()]); }}
      />
    );
  }

  if (agendamentosQuery.isLoading || contagensQuery.isLoading) return <DashboardSkeleton />;

  const consultasOrdenadas = [...stats.consultasHoje].sort((a: any, b: any) => (a.hora_inicio || '').localeCompare(b.hora_inicio || ''));
  const linkAtendimento = (ag: any) => `/prontuarios?paciente=${encodeURIComponent(ag.paciente_id)}&agendamento=${encodeURIComponent(ag.id)}`;
  const iniciais = (nome?: string | null) => (nome || 'P').split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const proximoPaciente = stats.proximoPaciente as any;
  const idadeProximo = proximoPaciente ? getAge(proximoPaciente.data_nascimento) : null;
  const produtividade = [
    { label: 'Atendimentos', value: stats.atendimentosMes, icon: UserCheck, href: '/agenda' },
    { label: 'Prontuários', value: stats.prontuariosMes, icon: FileText, href: '/prontuarios' },
    { label: 'Prescrições', value: stats.prescricoesMes, icon: Pill, href: '/prescricoes' },
    { label: 'Atestados', value: stats.atestadosMes, icon: ClipboardList, href: '/atestados' },
    { label: 'Exames solicitados', value: stats.examesMes, icon: TestTube, href: '/exames' },
    { label: 'Encaminhamentos', value: stats.encaminhamentosMes, icon: Send, href: '/encaminhamentos' },
  ];

  return (
    <div className="space-y-5 pb-10">
      <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-5">
        {/* ─── Cabeçalho ─── */}
        <motion.header variants={fadeUp} className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 shadow-glow ring-4 ring-card">
              {currentMedico?.foto_url && <StorageAvatarImage bucket="patient-photos" path={currentMedico.foto_url} />}
              <AvatarFallback className="bg-primary text-lg font-extrabold text-primary-foreground">
                {(currentMedico?.nome || 'DR').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-muted-foreground first-letter:uppercase">
                {hojeFormatado}<span className="opacity-40">·</span><LiveClockComponent />
                {currentMedico?.especialidade && <><span className="opacity-40">·</span><span className="inline-flex items-center gap-1 normal-case text-primary"><BadgeCheck className="h-3 w-3" />{currentMedico.especialidade}</span></>}
              </p>
              <h1 className="text-[26px] font-light leading-tight tracking-[-0.03em] md:text-[32px]">
                {saudacao}, <span className="font-extrabold">Dr(a). {firstName}</span>
              </h1>
              {currentMedico?.crm && (
                <p className="text-[11px] text-muted-foreground">
                  CRM {currentMedico.crm}/{currentMedico.crm_uf || 'SP'}{currentMedico.rqe ? ` · RQE ${currentMedico.rqe}` : ''}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button asChild><Link to="/prontuarios"><FileText className="h-4 w-4" />Novo prontuário</Link></Button>
            <Button variant="outline" asChild><Link to="/agenda"><Calendar className="h-4 w-4" />Minha agenda</Link></Button>
          </div>
        </motion.header>

        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          {/* ─── Coluna de pacientes do dia (estilo trilho + lista) ─── */}
          <motion.aside variants={fadeUp} aria-labelledby="pacientes-hoje-title" className="order-2 rounded-[24px] border border-border/60 bg-card p-4 shadow-xs xl:order-1 xl:sticky xl:top-24 xl:self-start">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 id="pacientes-hoje-title" className="text-lg font-extrabold tracking-tight">Pacientes de hoje</h2>
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-extrabold text-primary">{stats.totalHoje}</span>
            </div>
            {consultasOrdenadas.length > 0 ? (
              <ul className="space-y-1">
                {consultasOrdenadas.map((ag: any) => {
                  const paciente = ag.pacientes;
                  const ativo = ag.status === 'em_atendimento' || ag.id === stats.proximaConsulta?.id;
                  const alergico = paciente?.alergias && paciente.alergias.length > 0;
                  const conteudo = (
                    <>
                      <span className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-extrabold',
                        ativo ? 'bg-primary text-primary-foreground shadow-glow' : 'bg-accent text-primary',
                      )}>{iniciais(paciente?.nome)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className={cn('truncate text-sm font-bold', isAppointmentClosed(ag.status) && 'text-muted-foreground line-through decoration-1')}>{paciente?.nome || 'Paciente não encontrado'}</span>
                          {alergico && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Paciente com alergias" />}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">{statusLabel[ag.status] || ag.status}{ag.tipo ? ` · ${ag.tipo}` : ''}</span>
                      </span>
                      <span className="text-xs font-extrabold tabular-nums text-muted-foreground">{ag.hora_inicio?.slice(0, 5)}</span>
                    </>
                  );
                  const classe = cn('flex items-center gap-3 rounded-2xl p-2 transition', ativo ? 'bg-accent' : 'hover:bg-muted/60');
                  return (
                    <li key={ag.id}>
                      {!isAppointmentClosed(ag.status) && ag.paciente_id
                        ? <Link to={linkAtendimento(ag)} className={classe}>{conteudo}</Link>
                        : <div className={classe}>{conteudo}</div>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-8 text-center">
                <Calendar className="mb-2 h-7 w-7 text-primary" />
                <p className="text-sm font-bold">Sem consultas para hoje</p>
                <p className="mt-1 text-xs text-muted-foreground">Use o tempo livre para revisar laudos e retornos pendentes.</p>
              </div>
            )}
            <Link to="/agenda" className="mt-3 flex items-center justify-between rounded-2xl bg-muted/60 px-3 py-2.5 text-xs font-bold transition hover:bg-accent">
              <span className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-primary" />Amanhã: {stats.consultasAmanha} consulta{stats.consultasAmanha !== 1 ? 's' : ''}</span>
              <ArrowRight className="h-3.5 w-3.5 text-primary" />
            </Link>
          </motion.aside>

          <div className="order-1 min-w-0 space-y-5 xl:order-2">
            {/* ─── Destaque + indicadores ─── */}
            <motion.div variants={fadeUp} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              <section aria-labelledby="proximo-paciente-title" className="relative overflow-hidden rounded-[24px] bg-brand-dark p-6 text-white shadow-glow lg:row-span-2">
                <div className="relative flex h-full flex-col">
                  <h2 id="proximo-paciente-title" className="text-xs font-bold uppercase tracking-[0.12em] text-white/80">Próximo paciente</h2>
                  {stats.proximaConsulta && proximoPaciente ? (
                    <>
                      <p className="mt-3 text-[52px] font-light leading-none tracking-[-0.04em] tabular-nums">{stats.proximaConsulta.hora_inicio?.slice(0, 5)}</p>
                      <div className="mt-4 flex items-center gap-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-extrabold text-primary">{iniciais(proximoPaciente.nome)}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-lg font-bold">{proximoPaciente.nome}{idadeProximo !== null ? `, ${idadeProximo}` : ''}</span>
                          <span className="flex items-center gap-1 truncate text-xs text-white/75">
                            {stats.proximaConsulta.tipo || 'Consulta'}
                            {proximoPaciente.telefone && <><span className="opacity-50">·</span><Phone className="h-3 w-3" />{proximoPaciente.telefone}</>}
                          </span>
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold">{statusLabel[stats.proximaConsulta.status] || stats.proximaConsulta.status}</span>
                        {proximoPaciente.alergias?.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-200/40 bg-red-500/25 px-2.5 py-1 text-[11px] font-bold">
                            <AlertTriangle className="h-3 w-3" />Alergias: {proximoPaciente.alergias.join(', ')}
                          </span>
                        )}
                      </div>
                      <div className="mt-auto flex flex-wrap gap-2 pt-6">
                        <Link to={linkAtendimento(stats.proximaConsulta)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-primary transition hover:bg-white/90">
                          Iniciar atendimento <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link to="/fila" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/30 px-4 text-sm font-semibold transition hover:bg-white/10">Ver fila</Link>
                      </div>
                    </>
                  ) : (
                    <div className="mt-4">
                      <CheckCircle2 className="h-8 w-8 text-highlight" />
                      <p className="mt-3 text-xl font-bold">Nenhum paciente pendente</p>
                      <p className="mt-1 max-w-xs text-sm text-white/75">{stats.consultasAmanha > 0 ? `Amanhã você tem ${stats.consultasAmanha} consulta(s) agendada(s).` : 'Sua agenda está livre por enquanto.'}</p>
                    </div>
                  )}
                </div>
              </section>
              <section aria-labelledby="resumo-agenda-title" className="rounded-[22px] border border-border/70 bg-card p-5">
                <header className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <h2 id="resumo-agenda-title" className="text-base font-bold">Resumo de hoje</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Acompanhe o andamento da sua agenda.</p>
                  </div>
                  <Link to="/agenda" className="shrink-0 text-xs font-semibold text-primary hover:underline">Abrir agenda</Link>
                </header>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-5 min-[1360px]:grid-cols-3">
                  <div className="border-l-2 border-primary pl-3">
                    <dt className="text-xs text-muted-foreground">Consultas hoje</dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">{stats.totalHoje}</dd>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {stats.confirmadas} confirmada(s){stats.canceladasHoje > 0 ? ` · ${stats.canceladasHoje} cancelada(s)` : ''}
                    </p>
                  </div>
                  <div className="border-l-2 border-info pl-3">
                    <dt className="text-xs text-muted-foreground">Em atendimento</dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">{stats.emAtendimento}</dd>
                    <p className="mt-1 text-[11px] text-muted-foreground">Agora no consultório</p>
                  </div>
                  <div className="border-l-2 border-success pl-3">
                    <dt className="text-xs text-muted-foreground">Finalizados</dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">{stats.finalizadas}</dd>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {stats.totalHoje > 0 ? `${Math.round(stats.finalizadas / stats.totalHoje * 100)}% do dia` : 'Sem atendimentos'}
                    </p>
                  </div>
                  <div className="border-l-2 border-border pl-3 min-[1360px]:col-start-2">
                    <dt className="text-xs text-muted-foreground">Amanhã</dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">{stats.consultasAmanha}</dd>
                    <p className="mt-1 text-[11px] text-muted-foreground">Consulta(s) agendada(s)</p>
                  </div>
                </dl>
              </section>
            </motion.div>

            <motion.div variants={fadeUp} className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
              <section aria-labelledby="atividade-mes-title" className="rounded-[22px] border border-border/70 bg-card px-5">
                <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border/70 py-4">
                  <div>
                    <h2 id="atividade-mes-title" className="text-base font-bold">Atividade clínica</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Registros desde o primeiro dia deste mês.</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{format(parseISO(`${inicioMes}T12:00:00`), 'MMMM yyyy', { locale: ptBR })}</span>
                </header>
                <ul aria-label="Contagens da atividade clínica" className="divide-y divide-border/70">
                  <li>
                    <DoctorDashboardKpiLink href={null} className="flex min-h-12 items-center justify-between gap-4 py-2">
                      <span className="text-sm font-medium"><span>Meus Pacientes</span> <span className="text-xs font-normal text-muted-foreground">· Vinculados à sua agenda</span></span>
                      <span className="shrink-0 text-base font-semibold tabular-nums">{stats.meusPacientes}</span>
                    </DoctorDashboardKpiLink>
                  </li>
                  {produtividade.map(item => (
                    <li key={item.label}>
                      <DoctorDashboardKpiLink href={item.href} className="group flex min-h-12 items-center justify-between gap-4 py-2 text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <item.icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                          <span className="truncate">{item.label === 'Atendimentos' ? 'Atendimentos/Mês' : item.label === 'Prontuários' ? 'Prontuários/Mês' : item.label === 'Prescrições' ? 'Prescrições/Mês' : item.label}</span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">{item.value}</span>
                      </DoctorDashboardKpiLink>
                    </li>
                  ))}
                </ul>
              </section>

              {/* ─── Ações clínicas ─── */}
              <Card className="rounded-[22px]">
                <CardHeader className="pb-3"><CardTitle className="text-base">Ações rápidas</CardTitle><CardDescription>Documentos e pedidos mais usados no consultório</CardDescription></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2.5 2xl:grid-cols-3">
                    {[
                      { icon: FileText, label: 'Prontuário', href: '/prontuarios' },
                      { icon: Pill, label: 'Prescrição', href: '/prescricoes' },
                      { icon: ClipboardList, label: 'Atestado', href: '/atestados' },
                      { icon: TestTube, label: 'Exames', href: '/exames' },
                      { icon: Send, label: 'Encaminhar', href: '/encaminhamentos' },
                      { icon: Eye, label: 'Fila', href: '/fila' },
                    ].map(action => (
                      <Link key={action.label} to={action.href} className="flex min-h-[72px] flex-col justify-between rounded-xl border border-border bg-card p-3 text-foreground transition hover:border-primary/40 hover:bg-muted/40">
                        <action.icon className="h-5 w-5 text-primary" />
                        <span className="text-xs font-bold">{action.label}</span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {minhasTarefas.length > 0 && (
              <motion.div variants={fadeUp}>
                <Card className="rounded-[22px]">
                  <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-base">Minhas tarefas</CardTitle>
                    <Link to="/tarefas" className="text-xs font-bold text-primary hover:underline">Ver todas</Link>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y divide-dashed divide-border">{minhasTarefas.slice(0, 4).map(t => (
                      <li key={t.id} className="flex items-center gap-3 py-2">
                        <ListChecks className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.titulo}</span>
                        {t.data_vencimento && <span className={cn('shrink-0 text-xs font-bold tabular-nums', t.data_vencimento < hoje ? 'text-destructive' : 'text-muted-foreground')}>{formatWithDatePreference(parseDateOnly(t.data_vencimento)!, 'dd/MM', { locale: ptBR })}</span>}
                      </li>
                    ))}</ul>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {currentMedico && (
              <motion.div variants={fadeUp}>
                <Card className="rounded-[22px]">
                  <CardContent className="grid gap-3 p-5 sm:grid-cols-4">
                    {[
                      { label: 'CRM', value: `${currentMedico.crm}/${currentMedico.crm_uf || 'SP'}` },
                      { label: 'Especialidade', value: currentMedico.especialidade || 'Não informada' },
                      { label: 'RQE', value: currentMedico.rqe || '—' },
                      { label: 'Intervalo de consulta', value: `${currentMedico.intervalo_consulta ?? 30} min` },
                    ].map(item => (
                      <div key={item.label} className="rounded-2xl bg-muted/60 px-4 py-3">
                        <p className="text-[11px] font-semibold text-muted-foreground">{item.label}</p>
                        <p className="truncate text-sm font-extrabold">{item.value}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
