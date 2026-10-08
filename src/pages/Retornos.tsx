import { nomeMedico } from '@/lib/formatters';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO, isBefore, differenceInDays, addDays, isWithinInterval, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useSupabaseQuery } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { normalizarTexto, pacienteCorresponde } from '@/lib/buscaPaciente';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock, AlertTriangle, CheckCircle2, Phone, Clock, Filter, Search,
  CalendarPlus, CalendarDays, TrendingUp, Loader2, CalendarIcon, RefreshCw, Ban,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Retorno {
  id: string;
  paciente_id: string;
  medico_id: string;
  data_retorno_prevista: string;
  data_consulta_origem: string;
  status: string | null;
  motivo: string | null;
  tipo_retorno: string | null;
  lembrete_enviado: boolean | null;
  observacoes: string | null;
  agendamento_id: string | null;
  agendamento_retorno_id: string | null;
  clinica_id: string;
}

function telefoneBrasileiroParaWhatsApp(telefone: string | null | undefined): string | null {
  const digitos = String(telefone || '').replace(/\D/g, '');
  const jaTemCodigoDoPais = digitos.startsWith('55') && [12, 13].includes(digitos.length);
  const numero = jaTemCodigoDoPais ? digitos : `55${digitos}`;
  return /^55\d{10,11}$/.test(numero) ? numero : null;
}

export default function RetornosControl() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pacienteFiltroId = searchParams.get('paciente');
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [agendarDialogOpen, setAgendarDialogOpen] = useState(false);
  const [retornoParaAgendar, setRetornoParaAgendar] = useState<Retorno | null>(null);
  const [dataAgendamento, setDataAgendamento] = useState<Date>();
  const [horaAgendamento, setHoraAgendamento] = useState('09:00');
  const [isAgendando, setIsAgendando] = useState(false);
  const [foraExpediente, setForaExpediente] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<Retorno | null>(null);
  /** Confirmação antes de marcar realizado — antes era 1 clique sem volta. */
  const [realizando, setRealizando] = useState<Retorno | null>(null);
  const [isRealizando, setIsRealizando] = useState(false);
  const [isCancelando, setIsCancelando] = useState(false);
  const [agora, setAgora] = useState(() => new Date());
  const queryClient = useQueryClient();

  const { data: retornos = [], isLoading: loadingRetornos, error: erroRetornos, refetch: refetchRetornos } = useSupabaseQuery<Retorno>('retornos', {
    orderBy: { column: 'data_retorno_prevista', ascending: true },
  });

  const { data: pacientes = [], isLoading: loadingPacientes, error: erroPacientes, refetch: refetchPacientes } = useSupabaseQuery<{
    id: string;
    nome: string;
    nome_social: string | null;
    cpf: string | null;
    telefone: string | null;
    email: string | null;
  }>('pacientes', {
    select: 'id, nome, nome_social, cpf, telefone, email',
  });

  const { data: medicos = [], isLoading: loadingMedicos, error: erroMedicos, refetch: refetchMedicos } = useSupabaseQuery<{ id: string; nome: string | null; crm: string; especialidade: string | null }>('medicos', {
    select: 'id, nome, crm, especialidade',
  });

  const isLoading = loadingRetornos || loadingPacientes || loadingMedicos;

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const getPaciente = useCallback((id: string) => pacientes.find(p => p.id === id), [pacientes]);
  const getPacienteNome = useCallback((id: string) => {
    const paciente = getPaciente(id);
    return paciente?.nome_social?.trim() || paciente?.nome || 'Paciente';
  }, [getPaciente]);
  const getPacienteTelefone = useCallback((id: string) => pacientes.find(p => p.id === id)?.telefone || null, [pacientes]);
  const getMedicoNome = useCallback((id: string) => {
    const m = medicos.find(m => m.id === id);
    return m ? `${nomeMedico(m.nome || m.crm)}` : 'Médico';
  }, [medicos]);

  // Retornos vencem por data civil. parseDateOnly ancora em meio-dia para
  // evitar deslocamento de fuso, então normalizamos para meia-noite antes de
  // comparar com os DATEs retornados pelo Postgres; sem isso, o próprio dia do
  // vencimento era marcado como atrasado desde a abertura da tela.
  const hoje = useMemo(() => startOfDay(parseDateOnly(todaySaoPauloDateOnly(agora))!), [agora]);
  const retornosComStatus = useMemo(() => retornos.map(r => {
    const dataRetorno = parseISO(r.data_retorno_prevista);
    const diasAtraso = differenceInDays(hoje, dataRetorno);
    let statusCalculado = r.status || 'pendente';
    if (['pendente', 'agendado'].includes(statusCalculado) && isBefore(startOfDay(dataRetorno), hoje)) {
      statusCalculado = 'atrasado';
    }
    return { ...r, statusCalculado, diasAtraso, dataRetorno };
  }), [retornos, hoje]);

  const retornosNoEscopo = useMemo(
    () => pacienteFiltroId ? retornosComStatus.filter(r => r.paciente_id === pacienteFiltroId) : retornosComStatus,
    [retornosComStatus, pacienteFiltroId],
  );

  const filtrados = useMemo(() => {
    return retornosNoEscopo.filter(r => {
      if (filtroStatus === 'proximos7') {
        const em7dias = addDays(startOfDay(hoje), 7);
        const dentroDe7 = isWithinInterval(r.dataRetorno, { start: startOfDay(hoje), end: em7dias });
        if (!dentroDe7 || r.statusCalculado === 'realizado' || r.statusCalculado === 'cancelado') return false;
      } else if (filtroStatus !== 'todos' && r.statusCalculado !== filtroStatus) {
        return false;
      }
      if (searchTerm.trim()) {
        const paciente = getPaciente(r.paciente_id);
        const medico = normalizarTexto(getMedicoNome(r.medico_id));
        const motivo = normalizarTexto(r.motivo);
        const term = normalizarTexto(searchTerm);
        if (!(paciente && pacienteCorresponde(paciente, searchTerm)) &&
          !medico.includes(term) && !motivo.includes(term)) return false;
      }
      return true;
    });
  }, [retornosNoEscopo, filtroStatus, searchTerm, getPaciente, getMedicoNome, hoje]);
  const limparFiltros = () => {
    setSearchTerm('');
    setFiltroStatus('todos');
  };

  const pendentes = retornosNoEscopo.filter(r => r.statusCalculado === 'pendente').length;
  const atrasados = retornosNoEscopo.filter(r => r.statusCalculado === 'atrasado').length;
  const realizados = retornosNoEscopo.filter(r => r.statusCalculado === 'realizado').length;
  const proximos7 = retornosNoEscopo.filter(r => {
    const em7dias = addDays(startOfDay(hoje), 7);
    return isWithinInterval(r.dataRetorno, { start: startOfDay(hoje), end: em7dias }) &&
      r.statusCalculado !== 'realizado' && r.statusCalculado !== 'cancelado';
  }).length;

  const retornosComPrazoVencido = retornosNoEscopo.filter(r => r.statusCalculado !== 'cancelado' && isBefore(startOfDay(r.dataRetorno), hoje));
  const taxaComparecimento = retornosComPrazoVencido.length > 0
    ? Math.round((retornosComPrazoVencido.filter(r => r.statusCalculado === 'realizado').length / retornosComPrazoVencido.length) * 100)
    : 0;

  const marcarRealizado = async (retorno: Retorno) => {
    if (isRealizando) return;
    setIsRealizando(true);
    try {
      let updateQuery = supabase
        .from('retornos')
        .update({ status: 'realizado' } as any)
        .eq('id', retorno.id)
        .eq('clinica_id', retorno.clinica_id);
      updateQuery = retorno.status
        ? updateQuery.eq('status', retorno.status)
        : updateQuery.is('status', null);
      const { data, error } = await updateQuery
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('O retorno mudou desde que foi aberto. Atualize a lista antes de confirmar a presença.');
      toast.success('Retorno marcado como realizado');
      void queryClient.invalidateQueries({ queryKey: ['retornos'] });
      setRealizando(null);
    } catch (error) {
      toast.error('Erro ao atualizar retorno', { description: mensagemDeErro(error) });
    } finally {
      setIsRealizando(false);
    }
  };

  /** Desfazer um "realizado" marcado por engano — antes não havia como voltar. */
  const desfazerRealizado = async (r: Retorno) => {
    try {
      const { data, error } = await supabase
        .from('retornos')
        .update({ status: 'pendente' } as any)
        .eq('id', r.id)
        .eq('clinica_id', r.clinica_id)
        .eq('status', 'realizado')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O retorno mudou desde que foi aberto. Atualize a lista antes de reabri-lo.');
      toast.info('Retorno reaberto como pendente');
      void queryClient.invalidateQueries({ queryKey: ['retornos'] });
    } catch (error) {
      toast.error('Erro ao reabrir retorno', { description: mensagemDeErro(error) });
    }
  };

  const handleAgendarRetorno = (retorno: Retorno) => {
    setRetornoParaAgendar(retorno);
    setDataAgendamento(parseISO(retorno.data_retorno_prevista));
    setHoraAgendamento('09:00');
    setAgendarDialogOpen(true);
  };

  const handleRemarcarRetorno = async (retorno: Retorno) => {
    if (!retorno.agendamento_retorno_id) return;
    setIsAgendando(true);
    try {
      const { data: agendamento, error } = await supabase
        .from('agendamentos')
        .select('data, hora_inicio')
        .eq('id', retorno.agendamento_retorno_id)
        .eq('clinica_id', retorno.clinica_id)
        .single();
      if (error) throw error;
      setRetornoParaAgendar(retorno);
      setDataAgendamento(parseISO(agendamento.data));
      setHoraAgendamento(agendamento.hora_inicio?.slice(0, 5) || '09:00');
      setAgendarDialogOpen(true);
    } catch (error) {
      toast.error('Erro ao carregar o agendamento.', { description: mensagemDeErro(error) });
    } finally {
      setIsAgendando(false);
    }
  };

  const conferirHorarioRetorno = async (retorno: Retorno, data: string, horario: string, verificarExpediente = true): Promise<string | null> => {
    const toMinutos = (value?: string | null) => {
      if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
      const [hour, minute] = value.split(':').map(Number);
      return hour * 60 + minute;
    };
    const inicio = toMinutos(horario);
    const fim = inicio === null ? null : inicio + 30;
    if (inicio === null || fim === null || fim >= 24 * 60) {
      throw new Error('Informe um horário válido que termine antes da meia-noite.');
    }

    const { data: agendamentosDoDia, error: erroAgenda } = await supabase
      .from('agendamentos')
      .select('id, paciente_id, medico_id, hora_inicio, hora_fim, status')
      .eq('clinica_id', retorno.clinica_id)
      .eq('data', data);
    if (erroAgenda) throw new Error(`Não foi possível conferir a agenda do médico: ${mensagemDeErro(erroAgenda)}`);

    let conflitoMedico = false;
    let conflitoPaciente = false;
    for (const agendamento of (agendamentosDoDia || []) as any[]) {
      if (['cancelado', 'faltou'].includes(agendamento.status) || agendamento.id === retorno.agendamento_retorno_id) continue;
      const inicioExistente = toMinutos(agendamento.hora_inicio);
      if (inicioExistente === null) continue;
      const fimExistente = toMinutos(agendamento.hora_fim) ?? inicioExistente + 30;
      if (inicioExistente >= fim || fimExistente <= inicio) continue;
      if (agendamento.medico_id === retorno.medico_id) conflitoMedico = true;
      if (agendamento.paciente_id === retorno.paciente_id) conflitoPaciente = true;
    }
    if (conflitoMedico) throw new Error('Este médico já tem uma consulta neste horário. Escolha outro horário.');
    if (conflitoPaciente) throw new Error('Este paciente já tem outro atendimento neste horário. Escolha outro horário.');

    const { data: bloqueios, error: erroBloqueios } = await (supabase
      .from('bloqueios_agenda' as any)
      .select('id, hora_inicio, hora_fim, dia_inteiro, motivo, tipo')
      .eq('clinica_id', retorno.clinica_id)
      .eq('medico_id', retorno.medico_id)
      .lte('data_inicio', data)
      .gte('data_fim', data) as any);
    if (erroBloqueios) throw new Error(`Não foi possível conferir os bloqueios da agenda: ${mensagemDeErro(erroBloqueios)}`);

    const bloqueio = (bloqueios || []).find((item: any) => {
      if (item.dia_inteiro) return true;
      const inicioBloqueio = toMinutos(item.hora_inicio);
      const fimBloqueio = toMinutos(item.hora_fim);
      return inicioBloqueio !== null && fimBloqueio !== null && inicioBloqueio < fim && fimBloqueio > inicio;
    });
    if (bloqueio) throw new Error(`Horário bloqueado para este médico${bloqueio.motivo ? `: ${bloqueio.motivo}` : bloqueio.tipo ? `: ${bloqueio.tipo}` : '.'}`);

    if (!verificarExpediente) return null;
    const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay();
    const { data: jornada, error: erroJornada } = await (supabase.from('medico_disponibilidade' as any)
      .select('hora_inicio, hora_fim')
      .eq('medico_id', retorno.medico_id)
      .eq('dia_semana', diaSemana)
      .eq('ativo', true) as any);
    if (erroJornada) throw new Error(`Não foi possível conferir o expediente do médico: ${mensagemDeErro(erroJornada)}`);
    const dentroDoExpediente = ((jornada as any[]) || []).some(j => {
      const inicioJornada = toMinutos(j.hora_inicio);
      const fimJornada = toMinutos(j.hora_fim);
      return inicioJornada !== null && fimJornada !== null && inicio >= inicioJornada && fim <= fimJornada;
    });
    if (dentroDoExpediente) return null;
    const faixas = ((jornada as any[]) || [])
      .map(j => `${String(j.hora_inicio).slice(0, 5)}–${String(j.hora_fim).slice(0, 5)}`)
      .join(', ');
    return faixas
      ? `O expediente cadastrado do médico neste dia é ${faixas}.`
      : 'O médico não tem expediente cadastrado neste dia da semana.';
  };

  const cancelarRetorno = async () => {
    if (!cancelando) return;
    setIsCancelando(true);
    try {
      const { data, error } = await supabase.rpc('cancelar_retorno_atomico', {
        p_retorno_id: cancelando.id,
      });
      if (error) throw error;
      if (!data) throw new Error('O retorno já foi realizado, cancelado ou não está disponível para alteração. Atualize a lista.');
      queryClient.invalidateQueries({ queryKey: ['retornos'] });
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      setCancelando(null);
      toast.success('Retorno cancelado');
    } catch (error) {
      toast.error('Erro ao cancelar retorno.', { description: mensagemDeErro(error) });
    } finally {
      setIsCancelando(false);
    }
  };

  const confirmarAgendamento = async (confirmouForaExpediente = false) => {
    if (!retornoParaAgendar || !dataAgendamento) {
      toast.error('Selecione uma data para o agendamento.');
      return;
    }
    if (!horaAgendamento) {
      toast.error('Informe um horário para o agendamento.');
      return;
    }

    setIsAgendando(true);
    try {
      const data = format(dataAgendamento, 'yyyy-MM-dd');
      const avisoExpediente = await conferirHorarioRetorno(retornoParaAgendar, data, horaAgendamento, !confirmouForaExpediente);
      if (avisoExpediente) {
        setForaExpediente(avisoExpediente);
        return;
      }
      const { data: agendamentoId, error } = await supabase.rpc('agendar_retorno_atomico', {
        p_retorno_id: retornoParaAgendar.id,
        p_data: data,
        p_hora: horaAgendamento,
      });
      if (error) throw error;
      if (!agendamentoId) throw new Error('O retorno não foi vinculado a um horário. Atualize a lista e tente novamente.');

      queryClient.invalidateQueries({ queryKey: ['retornos'] });
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      setAgendarDialogOpen(false);
      setForaExpediente(null);
      toast.success(`${retornoParaAgendar.agendamento_retorno_id ? 'Retorno remarcado' : 'Retorno agendado'} para ${format(dataAgendamento, 'dd/MM/yyyy')} às ${horaAgendamento}`);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      toast.error('Não foi possível agendar o retorno.', { description: mensagemDeErro(error) });
    } finally {
      setIsAgendando(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'atrasado':
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Atrasado</Badge>;
      case 'pendente':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>;
      case 'agendado':
        return <Badge className="gap-1 bg-primary/10 text-primary border-primary/20"><CalendarPlus className="h-3 w-3" /> Agendado</Badge>;
      case 'realizado':
        return <Badge className="gap-1 bg-success text-success-foreground"><CheckCircle2 className="h-3 w-3" /> Realizado</Badge>;
      case 'cancelado':
        return <Badge variant="outline">Cancelado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const erroDeCarga = erroRetornos || erroPacientes || erroMedicos;
  if (erroDeCarga) return <ErrorState error={erroDeCarga} title="Não foi possível carregar o controle de retornos" onRetry={() => {
    void refetchRetornos();
    void refetchPacientes();
    void refetchMedicos();
  }} />;

  // Classes completas: Tailwind compila classes estáticas — o template
  // `text-${kpi.color}` gerava classe inexistente e "Atrasados" nunca ficava
  // vermelho.
  const kpis = [
    { key: 'atrasado', label: 'Atrasados', value: atrasados, icon: AlertTriangle, text: 'text-destructive', bg: 'bg-destructive/10', ring: 'ring-destructive' },
    { key: 'pendente', label: 'Pendentes', value: pendentes, icon: CalendarClock, text: 'text-warning', bg: 'bg-warning/10', ring: 'ring-warning' },
    { key: 'proximos7', label: 'Próximos 7 dias', value: proximos7, icon: CalendarDays, text: 'text-primary', bg: 'bg-primary/10', ring: 'ring-primary' },
    { key: 'realizado', label: 'Realizados', value: realizados, icon: CheckCircle2, text: 'text-success', bg: 'bg-success/10', ring: 'ring-success', extra: `${taxaComparecimento}% comparecimento` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <CalendarClock className="h-8 w-8 text-primary" />
            Controle de Retornos
          </h1>
          <p className="text-muted-foreground">Acompanhe retornos pendentes e atrasados</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Nome, CPF, telefone ou médico..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-11 w-full pl-9 sm:w-64"
            />
          </div>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="h-11 w-full sm:w-44">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="atrasado">Atrasados</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="proximos7">Próximos 7 dias</SelectItem>
              <SelectItem value="realizado">Realizados</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {pacienteFiltroId && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Exibindo retornos de <span className="font-medium">{getPacienteNome(pacienteFiltroId)}</span>.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const params = new URLSearchParams(searchParams);
              params.delete('paciente');
              setSearchParams(params, { replace: true });
            }}
          >
            Mostrar todos os retornos
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card
              className={cn("cursor-pointer transition-all hover:shadow-md", filtroStatus === kpi.key && `ring-2 ${kpi.ring}`)}
              role="button"
              tabIndex={0}
              aria-pressed={filtroStatus === kpi.key}
              onClick={() => setFiltroStatus(filtroStatus === kpi.key ? 'todos' : kpi.key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setFiltroStatus(filtroStatus === kpi.key ? 'todos' : kpi.key);
                }
              }}
            >
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase">{kpi.label}</p>
                    <p className={cn("text-3xl font-bold tabular-nums", kpi.text)}>{kpi.value}</p>
                    {kpi.extra && <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1"><TrendingUp className="h-3 w-3" />{kpi.extra}</p>}
                  </div>
                  <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center", kpi.bg)}>
                    <kpi.icon className={cn("h-5 w-5", kpi.text)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Retornos {filtroStatus !== 'todos' ? `(${filtroStatus})` : ''}</CardTitle>
          <CardDescription>{filtrados.length} retorno(s) encontrado(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {filtrados.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <CalendarClock className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p>
                {retornosNoEscopo.length === 0
                  ? pacienteFiltroId
                    ? `Nenhum retorno encontrado para ${getPacienteNome(pacienteFiltroId)}`
                    : 'Ainda não há retornos cadastrados'
                  : 'Nenhum retorno corresponde à busca e ao filtro selecionados'}
              </p>
              {retornosNoEscopo.length > 0 && (searchTerm.trim() || filtroStatus !== 'todos') && (
                <Button variant="link" onClick={limparFiltros} className="mt-2 h-11">Limpar busca e filtro</Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Médico</TableHead>
                    <TableHead>Data Retorno</TableHead>
                    <TableHead className="hidden md:table-cell">Motivo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {filtrados.map((r) => {
                      const whatsapp = telefoneBrasileiroParaWhatsApp(getPacienteTelefone(r.paciente_id));
                      const dataRetornoFutura = isBefore(hoje, startOfDay(r.dataRetorno));
                      return (
                      <motion.tr
                        key={r.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={cn(
                          "border-b transition-colors hover:bg-muted/50",
                          r.statusCalculado === 'atrasado' && 'bg-destructive/5',
                          r.diasAtraso > 30 && r.statusCalculado === 'atrasado' && 'bg-destructive/10 border-l-4 border-l-destructive'
                        )}
                      >
                        <TableCell className="font-medium">{getPacienteNome(r.paciente_id)}</TableCell>
                        <TableCell className="text-sm">{getMedicoNome(r.medico_id)}</TableCell>
                        <TableCell>
                          <div>
                            <span className="text-sm">{format(r.dataRetorno, 'dd/MM/yyyy', { locale: ptBR })}</span>
                            {r.statusCalculado === 'atrasado' && (
                              <p className="text-xs text-destructive font-medium">
                                {r.diasAtraso} dia(s) de atraso
                                {r.diasAtraso > 30 && ' ⚠️'}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                          {r.motivo || '—'}
                        </TableCell>
                        <TableCell>{getStatusBadge(r.statusCalculado)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap gap-1 justify-end">
                            {(r.statusCalculado === 'pendente' || r.statusCalculado === 'atrasado') && !r.agendamento_retorno_id && (
                              <Button size="sm" variant="outline" onClick={() => handleAgendarRetorno(r)} className="gap-1 text-primary border-primary/30 hover:bg-primary/5">
                                <CalendarPlus className="h-3 w-3" /> Agendar
                              </Button>
                            )}
                            {r.agendamento_retorno_id && !['realizado', 'cancelado'].includes(r.statusCalculado) && (
                              <Button size="sm" variant="outline" onClick={() => handleRemarcarRetorno(r)} disabled={isAgendando} className="gap-1">
                                {isAgendando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Remarcar
                              </Button>
                            )}
                            {!['realizado', 'cancelado'].includes(r.statusCalculado) && !dataRetornoFutura && (
                              <Button size="sm" variant="outline" onClick={() => setRealizando(r)} className="gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Realizado
                              </Button>
                            )}
                            {!['realizado', 'cancelado'].includes(r.statusCalculado) && dataRetornoFutura && (
                              <span className="inline-flex items-center gap-1 px-2 text-xs text-muted-foreground" role="status">
                                <Clock className="h-3 w-3" /> Disponível na data prevista
                              </span>
                            )}
                            {r.statusCalculado === 'realizado' && (
                              <Button
                                size="sm" variant="ghost" className="gap-1 text-muted-foreground"
                                aria-label="Reabrir retorno marcado como realizado"
                                onClick={() => desfazerRealizado(r)}
                              >
                                <RotateCcw className="h-3 w-3" /> Reabrir
                              </Button>
                            )}
                            {!['realizado', 'cancelado'].includes(r.statusCalculado) && (
                              <Button size="sm" variant="ghost" onClick={() => setCancelando(r)} className="gap-1 text-destructive hover:text-destructive" aria-label="Cancelar retorno">
                                <Ban className="h-3 w-3" /> Cancelar
                              </Button>
                            )}
                            {whatsapp && (
                              <Button size="sm" variant="ghost" asChild aria-label="Contatar via WhatsApp">
                                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                                  <Phone className="h-3 w-3" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agendar Retorno Dialog */}
      <Dialog open={agendarDialogOpen} onOpenChange={(open) => {
        if (!open && isAgendando) return;
        if (!open) setForaExpediente(null);
        setAgendarDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" />
              {retornoParaAgendar?.agendamento_retorno_id ? 'Remarcar Retorno' : 'Agendar Retorno'}
            </DialogTitle>
          </DialogHeader>
          {retornoParaAgendar && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <p className="text-sm font-medium">{getPacienteNome(retornoParaAgendar.paciente_id)}</p>
                <p className="text-xs text-muted-foreground">{getMedicoNome(retornoParaAgendar.medico_id)}</p>
                {retornoParaAgendar.motivo && <p className="text-xs text-muted-foreground">Motivo: {retornoParaAgendar.motivo}</p>}
              </div>

              <div className="space-y-2">
                <Label>Data do Agendamento</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataAgendamento && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dataAgendamento ? format(dataAgendamento, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecionar data'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dataAgendamento}
                      onSelect={setDataAgendamento}
                      disabled={(date) => date < startOfDay(hoje)}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Horário</Label>
                <Input type="time" value={horaAgendamento} onChange={e => setHoraAgendamento(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgendarDialogOpen(false)} disabled={isAgendando}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmarAgendamento()} disabled={isAgendando} className="gap-2">
              {isAgendando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              {retornoParaAgendar?.agendamento_retorno_id ? 'Confirmar Remarcação' : 'Confirmar Agendamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!foraExpediente} onOpenChange={open => { if (!open) setForaExpediente(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fora do expediente do médico</AlertDialogTitle>
            <AlertDialogDescription>
              {foraExpediente} O horário escolhido é {horaAgendamento}. Deseja agendar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Escolher outro horário</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setForaExpediente(null);
              void confirmarAgendamento(true);
            }}>
              Agendar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDialog
        open={Boolean(cancelando)}
        onOpenChange={(open) => !open && !isCancelando && setCancelando(null)}
        title="Cancelar retorno"
        description={`Cancelar o retorno de ${cancelando ? getPacienteNome(cancelando.paciente_id) : 'paciente'}? O horário vinculado também será cancelado.`}
        confirmLabel="Cancelar retorno"
        variant="destructive"
        onConfirm={cancelarRetorno}
        isLoading={isCancelando}
        closeOnConfirm={false}
      />

      <ConfirmDialog
        open={Boolean(realizando)}
        onOpenChange={(open) => !open && !isRealizando && setRealizando(null)}
        title="Marcar retorno como realizado"
        description={`Confirmar que ${realizando ? getPacienteNome(realizando.paciente_id) : 'paciente'} compareceu ao retorno${
          realizando ? ` previsto para ${format(parseISO(realizando.data_retorno_prevista), 'dd/MM/yyyy')}` : ''
        }?`}
        confirmLabel="Sim, foi realizado"
        onConfirm={() => realizando && void marcarRealizado(realizando)}
        isLoading={isRealizando}
        closeOnConfirm={false}
      />
    </div>
  );
}
