import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { format, parseISO, differenceInYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Calendar, Users, FileText, Pill, Clock, Stethoscope, ClipboardList,
  ArrowRight, ArrowUpRight, Activity, Target,
  Sun, Sunset, Moon, CheckCircle2, AlertTriangle, Eye, UserCheck,
  TestTube, Send, BadgeCheck, Phone, Timer, Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import {
  useAgendamentos, usePacientes, useProntuarios,
  usePrescricoes, useAtestados, useExames, useEncaminhamentos,
} from '@/hooks/useSupabaseData';
import { parseDateOnly } from '@/lib/dateOnly';
import { StorageAvatarImage } from '@/components/StorageImage';

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
  return <span className="tabular-nums font-semibold text-lg tracking-tight">{format(time, 'HH:mm')}</span>;
}

interface DoctorDashboardProps {
  userName: string;
}

export function DoctorDashboard({ userName }: DoctorDashboardProps) {
  const { currentMedico, medicoId } = useCurrentMedico();
  const { data: agendamentos = [] } = useAgendamentos();
  const { data: pacientes = [] } = usePacientes();
  const { data: prontuarios = [] } = useProntuarios();
  const { data: prescricoes = [] } = usePrescricoes();
  const { data: atestados = [] } = useAtestados(medicoId || undefined);
  const { data: exames = [] } = useExames(medicoId || undefined);
  const { data: encaminhamentos = [] } = useEncaminhamentos(medicoId || undefined);

  const hoje = format(new Date(), 'yyyy-MM-dd');
  const hojeFormatado = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });
  const horaAtual = new Date().getHours();
  const saudacao = horaAtual < 12 ? 'Bom dia' : horaAtual < 18 ? 'Boa tarde' : 'Boa noite';
  const SaudacaoIcon = horaAtual < 12 ? Sun : horaAtual < 18 ? Sunset : Moon;
  const firstName = userName?.split(' ')[0] || 'Doutor(a)';

  const stats = useMemo(() => {
    const myAgendamentos = medicoId ? agendamentos.filter(a => a.medico_id === medicoId) : agendamentos;
    const consultasHoje = myAgendamentos.filter(a => a.data === hoje);
    const confirmadas = consultasHoje.filter(a => a.status === 'confirmado').length;
    const agendadas = consultasHoje.filter(a => a.status === 'agendado').length;
    const finalizadas = consultasHoje.filter(a => a.status === 'finalizado').length;
    const emAtendimento = consultasHoje.filter(a => a.status === 'em_atendimento').length;
    const totalHoje = consultasHoje.length;

    const mesAtual = new Date().getMonth();
    const anoAtual = new Date().getFullYear();

    const myProntuarios = medicoId ? prontuarios.filter(p => p.medico_id === medicoId) : prontuarios;
    const prontuariosMes = myProntuarios.filter(p => {
      const d = parseDateOnly(p.data)!;
      return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    }).length;

    const myPrescricoes = medicoId ? prescricoes.filter(p => p.medico_id === medicoId) : prescricoes;
    const prescricoesMes = myPrescricoes.filter(p => {
      if (!p.data_emissao) return false;
      const d = parseDateOnly(p.data_emissao)!;
      return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    }).length;

    const atendimentosMes = myAgendamentos.filter(a => {
      const d = parseDateOnly(a.data)!;
      return a.status === 'finalizado' && d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    }).length;

    // Unique patients from this doctor's appointments
    const myPacienteIds = new Set(myAgendamentos.map(a => a.paciente_id));
    const meusPacientes = pacientes.filter(p => myPacienteIds.has(p.id));

    // Próximas consultas today ordered by time
    const proximasHoje = consultasHoje
      .filter(a => a.status !== 'finalizado' && a.status !== 'cancelado' && a.status !== 'faltou')
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

    // Tomorrow's schedule
    const amanha = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
    const consultasAmanha = myAgendamentos.filter(a => a.data === amanha).length;

    // Next appointment
    const proximaConsulta = proximasHoje[0] || null;
    const proximoPaciente = proximaConsulta ? pacientes.find(p => p.id === proximaConsulta.paciente_id) : null;

    return {
      totalHoje, confirmadas, agendadas, finalizadas, emAtendimento,
      prontuariosMes, prescricoesMes, atendimentosMes,
      meusPacientes: meusPacientes.length,
      atestadosMes: atestados.length,
      examesMes: exames.length,
      encaminhamentosMes: encaminhamentos.length,
      proximasHoje, consultasAmanha,
      proximaConsulta, proximoPaciente,
      consultasHoje,
    };
  }, [agendamentos, pacientes, prontuarios, prescricoes, atestados, exames, encaminhamentos, medicoId, hoje]);

  const getAge = (dob: string | null) => {
    if (!dob) return null;
    try { return differenceInYears(new Date(), parseISO(dob)); } catch { return null; }
  };

  const getPacienteNome = (pacienteId: string) => {
    const p = pacientes.find(p => p.id === pacienteId);
    return p?.nome || 'Paciente';
  };

  const statusColor: Record<string, string> = {
    agendado: 'bg-info/10 text-info border-info/20',
    confirmado: 'bg-success/10 text-success border-success/20',
    em_atendimento: 'bg-primary/10 text-primary border-primary/20',
    aguardando: 'bg-warning/10 text-warning border-warning/20',
    finalizado: 'bg-muted text-muted-foreground',
  };

  const statusLabel: Record<string, string> = {
    agendado: 'Agendado',
    confirmado: 'Confirmado',
    em_atendimento: 'Em Atendimento',
    aguardando: 'Aguardando',
    finalizado: 'Finalizado',
    cancelado: 'Cancelado',
    faltou: 'Faltou',
  };

  return (
    <div className="space-y-6 pb-10">
      <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
        {/* ─── Welcome Hero (Doctor) ─── */}
        <motion.div variants={fadeUp}>
          <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-card">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-info/5" />
            <div className="absolute top-0 right-0 w-80 h-80 bg-primary/4 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />

            <div className="relative p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="flex items-center gap-4">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    className="relative"
                  >
                    <Avatar className="h-16 w-16 ring-2 ring-primary/20 shadow-lg">
                      {currentMedico?.foto_url && <StorageAvatarImage bucket="patient-photos" path={currentMedico.foto_url} />}
                      <AvatarFallback className="bg-gradient-to-br from-primary/15 to-primary/5 text-primary text-xl font-bold">
                        {(currentMedico?.nome || 'DR').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -right-1 -bottom-1 h-5 w-5 rounded-full bg-success flex items-center justify-center shadow-md ring-2 ring-card">
                      <Stethoscope className="h-2.5 w-2.5 text-success-foreground" />
                    </div>
                  </motion.div>
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight">
                      {saudacao},{' '}
                      <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                        Dr(a). {firstName}
                      </span>
                    </h1>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <p className="text-sm text-muted-foreground capitalize">{hojeFormatado}</p>
                      <span className="text-border">•</span>
                      <LiveClockComponent />
                      {currentMedico?.especialidade && (
                        <>
                          <span className="text-border">•</span>
                          <Badge variant="outline" className="text-[10px] gap-1 border-primary/20">
                            <BadgeCheck className="h-3 w-3" />
                            {currentMedico.especialidade}
                          </Badge>
                        </>
                      )}
                    </div>
                    {currentMedico?.crm && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        CRM {currentMedico.crm}/{currentMedico.crm_uf || 'SP'}
                        {currentMedico.rqe ? ` · RQE ${currentMedico.rqe}` : ''}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <Button asChild size="default" className="shadow-lg shadow-primary/20 gap-2 rounded-full">
                    <Link to="/prontuarios"><FileText className="h-4 w-4" />Novo Prontuário</Link>
                  </Button>
                  <Button variant="outline" size="default" asChild className="gap-2 rounded-full">
                    <Link to="/agenda"><Calendar className="h-4 w-4" />Minha Agenda</Link>
                  </Button>
                </div>
              </div>

              {/* Mini Stats Strip */}
              <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-border/20">
                {[
                  { label: 'Consultas Hoje', value: stats.totalHoje, icon: Calendar, color: 'text-primary', bg: 'bg-primary/8' },
                  { label: 'Em Atendimento', value: stats.emAtendimento, icon: Activity, color: stats.emAtendimento > 0 ? 'text-primary' : 'text-muted-foreground', bg: stats.emAtendimento > 0 ? 'bg-primary/8' : 'bg-muted' },
                  { label: 'Finalizados', value: stats.finalizadas, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/8' },
                  { label: 'Amanhã', value: stats.consultasAmanha, icon: Clock, color: 'text-info', bg: 'bg-info/8' },
                ].map((s, i) => (
                  <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 + i * 0.05 }}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent/30 transition-colors"
                  >
                    <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', s.bg)}>
                      <s.icon className={cn('h-4 w-4', s.color)} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{s.label}</p>
                      <p className="text-sm font-bold tabular-nums">{s.value}</p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* ─── Next Patient Alert ─── */}
        {stats.proximaConsulta && stats.proximoPaciente && (
          <motion.div variants={fadeUp}>
            <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent overflow-hidden">
              <CardContent className="p-4 md:p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                      <Timer className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-primary uppercase tracking-widest">Próximo Paciente</p>
                      <p className="font-bold text-lg">{stats.proximoPaciente.nome}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {stats.proximaConsulta.hora_inicio?.slice(0, 5)}
                        </span>
                        {stats.proximoPaciente.data_nascimento && (
                          <>
                            <span className="text-border">•</span>
                            <span className="text-sm text-muted-foreground">
                              {getAge(stats.proximoPaciente.data_nascimento)} anos
                            </span>
                          </>
                        )}
                        {stats.proximoPaciente.telefone && (
                          <>
                            <span className="text-border">•</span>
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />{stats.proximoPaciente.telefone}
                            </span>
                          </>
                        )}
                      </div>
                      {stats.proximoPaciente.alergias && stats.proximoPaciente.alergias.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3 text-destructive" />
                          <span className="text-[11px] text-destructive font-medium">
                            Alergias: {stats.proximoPaciente.alergias.join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button asChild className="rounded-full gap-2 shrink-0">
                    <Link to="/prontuarios">
                      <FileText className="h-4 w-4" />Atender
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ─── KPI Cards ─── */}
        <motion.div variants={stagger} className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[
            { title: 'Meus Pacientes', value: stats.meusPacientes, icon: Users, color: 'primary' as const, href: '/pacientes', subtitle: 'Vinculados à sua agenda' },
            { title: 'Atendimentos/Mês', value: stats.atendimentosMes, icon: UserCheck, color: 'success' as const, href: '/agenda', subtitle: 'Consultas finalizadas' },
            { title: 'Prontuários/Mês', value: stats.prontuariosMes, icon: FileText, color: 'info' as const, href: '/prontuarios', subtitle: 'Registros clínicos' },
            { title: 'Prescrições/Mês', value: stats.prescricoesMes, icon: Pill, color: 'warning' as const, href: '/prescricoes', subtitle: 'Receitas emitidas' },
          ].map((kpi, i) => (
            <motion.div key={i} variants={fadeUp} custom={i}>
              <Link to={kpi.href}>
                <Card className="group relative overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border-border/40">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="space-y-1 flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{kpi.title}</p>
                        <p className="text-2xl font-bold font-display tracking-tight tabular-nums">{kpi.value}</p>
                        <p className="text-[11px] text-muted-foreground">{kpi.subtitle}</p>
                      </div>
                      <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center ring-1 shrink-0 transition-transform group-hover:scale-110',
                        `bg-${kpi.color}/8 ring-${kpi.color}/15`
                      )}>
                        <kpi.icon className={cn('h-5 w-5', `text-${kpi.color}`)} />
                      </div>
                    </div>
                  </CardContent>
                  <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-all">
                    <ArrowUpRight className={cn('h-4 w-4', `text-${kpi.color}`)} />
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* ─── Main Grid: Today's Schedule + Quick Actions + Stats ─── */}
        <motion.div variants={fadeUp} className="grid gap-6 lg:grid-cols-12">
          {/* Today's Schedule (7/12) */}
          <Card className="lg:col-span-7 border-border/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    Agenda de Hoje
                  </CardTitle>
                  <CardDescription>{stats.totalHoje} consulta{stats.totalHoje !== 1 ? 's' : ''} agendada{stats.totalHoje !== 1 ? 's' : ''}</CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild className="text-xs gap-1">
                  <Link to="/agenda">Ver completa <ArrowRight className="h-3 w-3" /></Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {stats.consultasHoje.length > 0 ? (
                <div className="space-y-2">
                  {stats.consultasHoje
                    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
                    .map((ag, idx) => {
                      const paciente = pacientes.find(p => p.id === ag.paciente_id);
                      const age = paciente ? getAge(paciente.data_nascimento) : null;
                      const hasAlergias = paciente?.alergias && paciente.alergias.length > 0;
                      const isCurrent = ag.status === 'em_atendimento';

                      return (
                        <motion.div
                          key={ag.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className={cn(
                            'flex items-center justify-between rounded-xl border p-3.5 transition-all group',
                            isCurrent
                              ? 'border-primary/30 bg-primary/5 shadow-sm'
                              : 'border-border/40 hover:bg-accent/30'
                          )}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={cn(
                              'h-11 w-11 rounded-lg flex flex-col items-center justify-center text-xs font-bold tabular-nums shrink-0',
                              isCurrent ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                            )}>
                              <span className="text-sm leading-none">{ag.hora_inicio?.slice(0, 5)}</span>
                              {ag.hora_fim && <span className="text-[9px] opacity-60">{ag.hora_fim?.slice(0, 5)}</span>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">
                                  {paciente?.nome || 'Paciente não encontrado'}
                                </p>
                                {hasAlergias && (
                                  <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                {age !== null && <span>{age} anos</span>}
                                {paciente?.sexo && (
                                  <>
                                    <span className="text-border">•</span>
                                    <span>{paciente.sexo === 'M' ? 'Masculino' : paciente.sexo === 'F' ? 'Feminino' : paciente.sexo}</span>
                                  </>
                                )}
                                {ag.tipo && (
                                  <>
                                    <span className="text-border">•</span>
                                    <span className="capitalize">{ag.tipo}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className={cn('text-[10px] capitalize', statusColor[ag.status] || '')}>
                              {statusLabel[ag.status] || ag.status}
                            </Badge>
                            {ag.status !== 'finalizado' && ag.status !== 'cancelado' && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" asChild>
                                <Link to="/prontuarios">
                                  <FileText className="h-4 w-4" />
                                </Link>
                              </Button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">Sem consultas para hoje</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {stats.consultasAmanha > 0 ? `${stats.consultasAmanha} consulta(s) amanhã` : 'Agenda livre'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column: Quick Actions + Clinical Stats (5/12) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Quick Clinical Actions */}
            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-warning" />
                  Ações Rápidas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: FileText, label: 'Prontuário', href: '/prontuarios', color: 'bg-primary/10 text-primary' },
                    { icon: Pill, label: 'Prescrição', href: '/prescricoes', color: 'bg-warning/10 text-warning' },
                    { icon: ClipboardList, label: 'Atestado', href: '/atestados', color: 'bg-info/10 text-info' },
                    { icon: TestTube, label: 'Exames', href: '/exames', color: 'bg-destructive/10 text-destructive' },
                    { icon: Send, label: 'Encaminhar', href: '/encaminhamentos', color: 'bg-success/10 text-success' },
                    { icon: Eye, label: 'Fila', href: '/fila', color: 'bg-accent text-accent-foreground' },
                  ].map((action, i) => (
                    <Link key={i} to={action.href}
                      className="group flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-accent/50 transition-all"
                    >
                      <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 group-hover:shadow-md', action.color)}>
                        <action.icon className="h-5 w-5" />
                      </div>
                      <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors text-center leading-tight">
                        {action.label}
                      </span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Clinical Statistics */}
            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Produtividade do Mês
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {[
                  { label: 'Atendimentos', value: stats.atendimentosMes, icon: UserCheck, color: 'text-success', bg: 'bg-success/8' },
                  { label: 'Prontuários', value: stats.prontuariosMes, icon: FileText, color: 'text-info', bg: 'bg-info/8' },
                  { label: 'Prescrições', value: stats.prescricoesMes, icon: Pill, color: 'text-warning', bg: 'bg-warning/8' },
                  { label: 'Atestados', value: stats.atestadosMes, icon: ClipboardList, color: 'text-primary', bg: 'bg-primary/8' },
                  { label: 'Exames Solicitados', value: stats.examesMes, icon: TestTube, color: 'text-destructive', bg: 'bg-destructive/8' },
                  { label: 'Encaminhamentos', value: stats.encaminhamentosMes, icon: Send, color: 'text-success', bg: 'bg-success/8' },
                ].map((stat, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center', stat.bg)}>
                        <stat.icon className={cn('h-3.5 w-3.5', stat.color)} />
                      </div>
                      <span className="text-sm text-muted-foreground">{stat.label}</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{stat.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Doctor Info Card */}
            {currentMedico && (
              <Card className="border-border/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-primary" />
                    Dados Profissionais
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">CRM</span>
                    <Badge variant="outline">{currentMedico.crm}/{currentMedico.crm_uf || 'SP'}</Badge>
                  </div>
                  {currentMedico.especialidade && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Especialidade</span>
                      <span className="font-medium">{currentMedico.especialidade}</span>
                    </div>
                  )}
                  {currentMedico.rqe && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">RQE</span>
                      <span className="font-medium">{currentMedico.rqe}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Intervalo Consulta</span>
                    <Badge variant="secondary" className="tabular-nums">{currentMedico.intervalo_consulta ?? 30} min</Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </motion.div>

        {/* ─── Secondary KPIs ─── */}
        <motion.div variants={stagger} className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[
            { title: 'Atestados Emitidos', value: stats.atestadosMes, icon: ClipboardList, color: 'info' as const, href: '/atestados' },
            { title: 'Exames Solicitados', value: stats.examesMes, icon: TestTube, color: 'warning' as const, href: '/exames' },
            { title: 'Encaminhamentos', value: stats.encaminhamentosMes, icon: Send, color: 'success' as const, href: '/encaminhamentos' },
            { title: 'Consultas Amanhã', value: stats.consultasAmanha, icon: Calendar, color: 'primary' as const, href: '/agenda' },
          ].map((kpi, i) => (
            <motion.div key={i} variants={fadeUp} custom={i}>
              <Link to={kpi.href}>
                <Card className="group relative overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border-border/40">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{kpi.title}</p>
                        <p className="text-2xl font-bold tabular-nums">{kpi.value}</p>
                      </div>
                      <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center ring-1 shrink-0 group-hover:scale-110 transition-transform',
                        `bg-${kpi.color}/8 ring-${kpi.color}/15`
                      )}>
                        <kpi.icon className={cn('h-4.5 w-4.5', `text-${kpi.color}`)} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
