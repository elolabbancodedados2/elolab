import { formatWithDatePreference as format } from '@/lib/datePreference';
import { nomeMedico } from '@/lib/formatters';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isBefore, differenceInDays, addDays, isWithinInterval, startOfDay, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
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
import { MAX_LINHAS_AUTO, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { normalizarTexto, pacienteCorresponde } from '@/lib/buscaPaciente';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { linkWhatsApp } from '@/lib/whatsapp';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock, AlertTriangle, CheckCircle2, Clock, Filter, Search,
  CalendarPlus, CalendarDays, TrendingUp, Loader2, CalendarIcon, RefreshCw, Ban,
  RotateCcw, MessageCircle, Stethoscope, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { horarioAgendadoJaChegou } from '@/lib/retornoHorario';
import { podeMarcarRetornoRealizado } from '@/lib/returnCompletion';

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

type Periodo = 'todos' | 'hoje' | '7dias' | '30dias';

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'hoje', label: 'Hoje' },
  { key: '7dias', label: '7 dias' },
  { key: '30dias', label: '30 dias' },
];

const PILL_BASE = 'h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]';
const PILL_ATIVA = 'border-transparent bg-gradient-primary text-white shadow-sm';
const PILL_INATIVA = 'border-border bg-card text-muted-foreground hover:border-[#9CC7EC] hover:text-foreground';

function mensagemWhatsApp(primeiroNome: string, medico: string, data: string) {
  return `Olá, ${primeiroNome}. Seu retorno com ${medico} está previsto para ${data}. Podemos confirmar o horário?`;
}

export default function RetornosControl() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pacienteFiltroId = searchParams.get('paciente');
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [periodo, setPeriodo] = useState<Periodo>('todos');
  const [medicoFiltro, setMedicoFiltro] = useState('todos');
  const [apenasMeusEscolhido, setApenasMeusEscolhido] = useState<boolean | null>(null);
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
  const { profile } = useSupabaseAuth();
  // Vínculo do usuário com um cadastro médico: habilita o atalho "Meus retornos"
  // e, para médicos sem papel operacional, deixa o escopo individual ligado por padrão.
  const { medicoId: meuMedicoId, isMedicoOnly } = useCurrentMedico();
  const apenasMeus = Boolean(meuMedicoId) && (apenasMeusEscolhido ?? isMedicoOnly);
  const filtrosClinica = [{ column: 'clinica_id', operator: 'eq', value: profile?.clinica_id ?? '' }];

  const { data: retornos = [], isLoading: loadingRetornos, error: erroRetornos, refetch: refetchRetornos } = useSupabaseQuery<Retorno>('retornos', {
    orderBy: { column: 'data_retorno_prevista', ascending: true },
    filters: filtrosClinica,
    enabled: !!profile?.clinica_id,
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
    filters: filtrosClinica,
    enabled: !!profile?.clinica_id,
  });

  const { data: medicos = [], isLoading: loadingMedicos, error: erroMedicos, refetch: refetchMedicos } = useSupabaseQuery<{ id: string; nome: string | null; crm: string; especialidade: string | null }>('medicos', {
    select: 'id, nome, crm, especialidade',
    filters: filtrosClinica,
    enabled: !!profile?.clinica_id,
  });

  const idsAgendamentosParaConcluir = useMemo(() => Array.from(new Set(
    retornos
      .filter(r =>
        r.data_retorno_prevista <= todaySaoPauloDateOnly(agora) &&
        !['realizado', 'cancelado'].includes(r.status || '') &&
        r.agendamento_retorno_id,
      )
      .map(r => r.agendamento_retorno_id as string),
  )).sort(), [retornos, agora]);
  const {
    data: agendamentosRetornoParaConcluir = [],
    isLoading: loadingAgendamentosRetornoParaConcluir,
    error: erroAgendamentosRetornoParaConcluir,
    refetch: refetchAgendamentosRetornoParaConcluir,
  } = useQuery<{ id: string; data: string; hora_inicio: string; status: string }[]>({
    queryKey: ['retornos-agendamentos-para-concluir', profile?.clinica_id, idsAgendamentosParaConcluir],
    enabled: !!profile?.clinica_id && idsAgendamentosParaConcluir.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('agendamentos')
        .select('id, data, hora_inicio, status')
        .eq('clinica_id', profile?.clinica_id)
        .in('id', idsAgendamentosParaConcluir);
      if (error) throw error;
      return (data || []) as { id: string; data: string; hora_inicio: string; status: string }[];
    },
  });
  const agendamentoRetornoPorId = useMemo(
    () => new Map(agendamentosRetornoParaConcluir.map(a => [a.id, a])),
    [agendamentosRetornoParaConcluir],
  );

  const isLoading = loadingRetornos || loadingPacientes || loadingMedicos || loadingAgendamentosRetornoParaConcluir;

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
    const dataRetorno = parseDateOnly(r.data_retorno_prevista)!;
    const diasAtraso = differenceInDays(hoje, dataRetorno);
    let statusCalculado = r.status || 'pendente';
    if (['pendente', 'agendado'].includes(statusCalculado) && isBefore(startOfDay(dataRetorno), hoje)) {
      statusCalculado = 'atrasado';
    }
    return { ...r, statusCalculado, diasAtraso, dataRetorno };
  }), [retornos, hoje]);

  // Escopo = paciente da URL + responsabilidade (meus retornos / médico escolhido).
  // Os indicadores acompanham o escopo; busca, status e período filtram só a lista.
  const medicoEscopoId = apenasMeus ? meuMedicoId : (medicoFiltro !== 'todos' ? medicoFiltro : null);
  const retornosNoEscopo = useMemo(
    () => retornosComStatus.filter(r =>
      (!pacienteFiltroId || r.paciente_id === pacienteFiltroId) &&
      (!medicoEscopoId || r.medico_id === medicoEscopoId),
    ),
    [retornosComStatus, pacienteFiltroId, medicoEscopoId],
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
      if (periodo === 'hoje' && !isSameDay(startOfDay(r.dataRetorno), hoje)) return false;
      if (periodo === '7dias' && !isWithinInterval(startOfDay(r.dataRetorno), { start: hoje, end: addDays(hoje, 7) })) return false;
      if (periodo === '30dias' && !isWithinInterval(startOfDay(r.dataRetorno), { start: hoje, end: addDays(hoje, 30) })) return false;
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
  }, [retornosNoEscopo, filtroStatus, periodo, searchTerm, getPaciente, getMedicoNome, hoje]);
  const temFiltro = Boolean(searchTerm.trim()) || filtroStatus !== 'todos' || periodo !== 'todos' || (!apenasMeus && medicoFiltro !== 'todos');
  const limparFiltros = () => {
    setSearchTerm('');
    setFiltroStatus('todos');
    setPeriodo('todos');
    setMedicoFiltro('todos');
  };

  const pendentes = retornosNoEscopo.filter(r => r.statusCalculado === 'pendente').length;
  const atrasados = retornosNoEscopo.filter(r => r.statusCalculado === 'atrasado').length;
  const realizados = retornosNoEscopo.filter(r => r.statusCalculado === 'realizado').length;
  const acimaDeTrinta = retornosNoEscopo.filter(r => r.statusCalculado === 'atrasado' && r.diasAtraso > 30).length;
  const proximos7 = retornosNoEscopo.filter(r => {
    const em7dias = addDays(startOfDay(hoje), 7);
    return isWithinInterval(r.dataRetorno, { start: startOfDay(hoje), end: em7dias }) &&
      r.statusCalculado !== 'realizado' && r.statusCalculado !== 'cancelado';
  }).length;

  const retornosComPrazoVencido = retornosNoEscopo.filter(r => r.statusCalculado !== 'cancelado' && isBefore(startOfDay(r.dataRetorno), hoje));
  const taxaComparecimento = retornosComPrazoVencido.length > 0
    ? Math.round((retornosComPrazoVencido.filter(r => r.statusCalculado === 'realizado').length / retornosComPrazoVencido.length) * 100)
    : 0;

  // Destaque: o atrasado mais antigo; se não houver, o próximo retorno em aberto.
  // A lista já vem ordenada por data, então o primeiro encontrado é o mais urgente.
  const destaque = retornosNoEscopo.find(r => r.statusCalculado === 'atrasado')
    ?? retornosNoEscopo.find(r => r.statusCalculado === 'pendente' || r.statusCalculado === 'agendado')
    ?? null;

  const marcarRealizado = async (retorno: Retorno) => {
    if (isRealizando) return;
    setIsRealizando(true);
    try {
      const { data, error } = await (supabase as any).rpc('marcar_retorno_realizado_atomico', {
        p_retorno_id: retorno.id,
      });
      if (error) throw error;
      if (!data) throw new Error('O retorno mudou ou o agendamento ainda não terminou. Atualize a lista antes de confirmar a presença.');
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
    setDataAgendamento(parseDateOnly(retorno.data_retorno_prevista) ?? undefined);
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
      setDataAgendamento(parseDateOnly(agendamento.data) ?? undefined);
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
      const { data: agendamentoId, error } = await (supabase as any).rpc('agendar_retorno_atomico', {
        p_retorno_id: retornoParaAgendar.id,
        p_data: data,
        p_hora: horaAgendamento,
        p_confirmou_fora_expediente: confirmouForaExpediente,
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

  const atualizarTudo = () => {
    void refetchRetornos();
    void refetchPacientes();
    void refetchMedicos();
    void refetchAgendamentosRetornoParaConcluir();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'atrasado':
        return <Badge variant="destructive" className="gap-1 rounded-full"><AlertTriangle className="h-3 w-3" /> Atrasado</Badge>;
      case 'pendente':
        return <Badge variant="outline" className="gap-1 rounded-full border-warning/40 bg-warning/10 text-warning-foreground"><Clock className="h-3 w-3" /> Pendente</Badge>;
      case 'agendado':
        return <Badge variant="outline" className="gap-1 rounded-full border-[#BFD8EE] bg-[#1080CA]/10 text-[#1080CA]"><CalendarPlus className="h-3 w-3" /> Agendado</Badge>;
      case 'realizado':
        return <Badge className="gap-1 rounded-full bg-success text-success-foreground hover:bg-success"><CheckCircle2 className="h-3 w-3" /> Realizado</Badge>;
      case 'cancelado':
        return <Badge variant="outline" className="rounded-full text-muted-foreground">Cancelado</Badge>;
      default:
        return <Badge variant="secondary" className="rounded-full">{status}</Badge>;
    }
  };

  const linkWhatsAppRetorno = (r: { paciente_id: string; medico_id: string; dataRetorno: Date }) => linkWhatsApp(
    getPacienteTelefone(r.paciente_id),
    mensagemWhatsApp(getPacienteNome(r.paciente_id).split(' ')[0], getMedicoNome(r.medico_id), format(r.dataRetorno, 'dd/MM/yyyy', { locale: ptBR })),
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /></div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const erroDeCarga = erroRetornos || erroPacientes || erroMedicos || erroAgendamentosRetornoParaConcluir;
  if (erroDeCarga) return <ErrorState error={erroDeCarga} title="Não foi possível carregar o controle de retornos" onRetry={atualizarTudo} />;

  // Classes completas: Tailwind compila classes estáticas — templates como
  // `text-${cor}` geravam classe inexistente e "Atrasados" nunca ficava colorido.
  const kpis = [
    { key: 'atrasado', label: 'Atrasados', value: atrasados, icon: AlertTriangle, color: 'text-white', surface: 'bg-white/15', escuro: true, caption: acimaDeTrinta > 0 ? `${acimaDeTrinta} acima de 30 dias` : 'fora da data prevista' },
    { key: 'pendente', label: 'Pendentes', value: pendentes, icon: CalendarClock, color: 'text-warning', surface: 'bg-warning/10', escuro: false, caption: 'ainda sem horário marcado' },
    { key: 'proximos7', label: 'Próximos 7 dias', value: proximos7, icon: CalendarDays, color: 'text-[#1080CA]', surface: 'bg-[#1080CA]/10', escuro: false, caption: 'a partir de hoje' },
    { key: 'realizado', label: 'Realizados', value: realizados, icon: CheckCircle2, color: 'text-success', surface: 'bg-success/10', escuro: false, caption: `${taxaComparecimento}% de comparecimento` },
  ];

  const descricaoHeader = retornosNoEscopo.length === 0
    ? 'Acompanhe retornos pendentes e atrasados'
    : `${atrasados} atrasado${atrasados === 1 ? '' : 's'} · ${proximos7} nos próximos 7 dias${apenasMeus ? ' · só os meus' : ''}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Controle de Retornos"
        description={descricaoHeader}
        icon={<CalendarClock />}
        actions={(
          <>
            {meuMedicoId && (
              <label className="flex min-h-10 items-center gap-2 rounded-full border border-border/60 bg-card px-3 text-sm text-muted-foreground">
                <Switch
                  checked={apenasMeus}
                  onCheckedChange={(v) => setApenasMeusEscolhido(v)}
                  aria-label="Mostrar só meus retornos"
                />
                Meus retornos
              </label>
            )}
            {!isMedicoOnly && medicos.length > 1 && (
              <Select value={medicoFiltro} onValueChange={setMedicoFiltro} disabled={apenasMeus}>
                <SelectTrigger aria-label="Filtrar retornos por médico" className="h-10 w-[190px] shrink-0 rounded-full">
                  <Stethoscope aria-hidden="true" className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="Todos os médicos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os médicos</SelectItem>
                  {medicos.map(m => <SelectItem key={m.id} value={m.id}>{nomeMedico(m.nome || m.crm)}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="icon" className="shrink-0 rounded-full" onClick={atualizarTudo} aria-label="Atualizar retornos" title="Atualizar retornos">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              className="shrink-0 gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110"
              onClick={() => navigate('/agenda')}
              title="Abre a agenda para conferir os horários dos retornos"
            >
              <CalendarDays aria-hidden="true" className="h-4 w-4" /> Abrir agenda
            </Button>
          </>
        )}
      />

      {pacienteFiltroId && (
        <div className="flex flex-col gap-2 rounded-2xl border border-[#DCE6F2] bg-[#F3F8FC] p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Exibindo retornos de <span className="font-medium">{getPacienteNome(pacienteFiltroId)}</span>.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
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

      {retornos.length >= MAX_LINHAS_AUTO && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground" role="status">
          A lista atingiu o limite de {MAX_LINHAS_AUTO.toLocaleString('pt-BR')} retornos carregados. A lista e os indicadores podem estar incompletos.
        </div>
      )}

      {/* Indicadores */}
      <section role="group" aria-label="Resumo dos retornos" className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {kpis.map(kpi => {
          const Icon = kpi.icon;
          const ativo = filtroStatus === kpi.key;
          return (
            <button
              key={kpi.key}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFiltroStatus(ativo ? 'todos' : kpi.key)}
              className={cn(
                'rounded-2xl border border-border/60 bg-card text-left shadow-xs transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1080CA]',
                kpi.escuro && 'border-transparent bg-gradient-primary text-white',
                ativo && !kpi.escuro && 'border-[#1080CA]/50 ring-1 ring-[#1080CA]/30',
                ativo && kpi.escuro && 'ring-2 ring-[#1080CA]/60',
              )}
            >
              <div className="flex min-h-[96px] items-center gap-3 p-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', kpi.surface)}>
                  <Icon aria-hidden="true" className={cn('h-5 w-5', kpi.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className={cn('truncate text-xs font-semibold', kpi.escuro ? 'text-white/80' : 'text-foreground')}>{kpi.label}</h3>
                    <span className={cn('text-2xl font-bold tabular-nums', kpi.color)}>{kpi.value}</span>
                  </div>
                  <p className={cn('flex items-center gap-1 truncate text-[11px]', kpi.escuro ? 'text-white/60' : 'text-muted-foreground')}>
                    {kpi.key === 'realizado' && <TrendingUp aria-hidden="true" className="h-3 w-3 shrink-0" />}
                    {kpi.caption}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {/* Destaque: retorno mais urgente */}
      {destaque && (() => {
        const whatsapp = linkWhatsAppRetorno(destaque);
        const atrasado = destaque.statusCalculado === 'atrasado';
        return (
          <Card className="overflow-hidden rounded-2xl border-[#1080CA]/30 shadow-[0_8px_24px_rgba(16,128,202,0.12)]">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                  {atrasado ? <AlertTriangle className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1080CA]">{atrasado ? 'Atrasado há mais tempo' : 'Próximo retorno'}</p>
                  <h2 className="truncate text-lg font-bold text-foreground">{getPacienteNome(destaque.paciente_id)}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Stethoscope aria-hidden="true" className="h-3 w-3" /> {getMedicoNome(destaque.medico_id)}</span>
                    <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden="true" className="h-3 w-3" /> {format(destaque.dataRetorno, 'dd/MM/yyyy', { locale: ptBR })}</span>
                    {atrasado && (
                      <span className={cn('inline-flex items-center gap-1 font-semibold text-destructive')}>
                        <Clock aria-hidden="true" className="h-3 w-3" /> {destaque.diasAtraso} dia{destaque.diasAtraso === 1 ? '' : 's'} de atraso
                      </span>
                    )}
                    {getStatusBadge(destaque.statusCalculado)}
                  </div>
                  {destaque.motivo && <p className="mt-1 truncate text-xs text-muted-foreground" title={destaque.motivo}>Motivo: {destaque.motivo}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {whatsapp ? (
                  <Button asChild variant="outline" className="h-10 gap-1.5 rounded-full border-[#1080CA]/30 text-[#1080CA] hover:bg-[#1080CA]/10 hover:text-[#1080CA]">
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" className="h-4 w-4" /> WhatsApp</a>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Sem telefone válido</span>
                )}
                {destaque.agendamento_retorno_id ? (
                  <Button variant="outline" className="h-10 gap-1.5 rounded-full" onClick={() => void handleRemarcarRetorno(destaque)} disabled={isAgendando}>
                    {isAgendando ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />} Remarcar
                  </Button>
                ) : (
                  <Button className="h-10 gap-1.5 rounded-full bg-gradient-primary text-white hover:brightness-110" onClick={() => handleAgendarRetorno(destaque)}>
                    <CalendarPlus aria-hidden="true" className="h-4 w-4" /> Agendar retorno
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Lista */}
      <Card className="rounded-2xl border-border/60 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary text-white">
                  <CalendarClock className="h-4 w-4" />
                </span>
                Retornos
                <Badge variant="outline" className="rounded-full border-[#BFD8EE] text-[#1080CA]">{filtrados.length} de {retornosNoEscopo.length}</Badge>
              </CardTitle>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-72">
                  <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Buscar retornos por paciente ou médico"
                    placeholder="Nome, CPF, telefone ou médico..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]"
                  />
                </div>
                <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                  <SelectTrigger aria-label="Filtrar retornos por status" className="h-10 w-full rounded-full sm:w-44">
                    <Filter aria-hidden="true" className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="atrasado">Atrasados</SelectItem>
                    <SelectItem value="pendente">Pendentes</SelectItem>
                    <SelectItem value="agendado">Agendados</SelectItem>
                    <SelectItem value="proximos7">Próximos 7 dias</SelectItem>
                    <SelectItem value="realizado">Realizados</SelectItem>
                    <SelectItem value="cancelado">Cancelados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div role="group" aria-label="Filtrar por período" className="flex flex-wrap items-center gap-1.5">
              {PERIODOS.map(opt => {
                const ativo = periodo === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setPeriodo(opt.key)}
                    className={cn(PILL_BASE, ativo ? PILL_ATIVA : PILL_INATIVA)}
                  >
                    {opt.label}
                  </button>
                );
              })}
              {temFiltro && (
                <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-xs text-muted-foreground" onClick={limparFiltros}>
                  <X aria-hidden="true" className="h-3 w-3" /> Limpar filtros
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{filtrados.length} de {retornosNoEscopo.length}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtrados.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <span aria-hidden="true" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-md">
                <CalendarClock className="h-7 w-7" />
              </span>
              <p className="font-medium text-foreground">
                {retornosNoEscopo.length === 0
                  ? pacienteFiltroId
                    ? `Nenhum retorno encontrado para ${getPacienteNome(pacienteFiltroId)}`
                    : apenasMeus
                      ? 'Você ainda não tem retornos previstos'
                      : 'Ainda não há retornos cadastrados'
                  : 'Nenhum retorno corresponde à busca e ao filtro selecionados'}
              </p>
              <p className="mt-1 text-sm">
                {retornosNoEscopo.length === 0
                  ? 'Os retornos são criados ao encerrar o atendimento no prontuário.'
                  : 'Ajuste a busca, o status ou o período.'}
              </p>
              {retornosNoEscopo.length > 0 && temFiltro ? (
                <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={limparFiltros}>Limpar busca e filtro</Button>
              ) : apenasMeus && retornos.length > 0 ? (
                <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={() => setApenasMeusEscolhido(false)}>Ver retornos da clínica</Button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/60">
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
                  {filtrados.map((r) => {
                    const whatsapp = linkWhatsAppRetorno(r);
                    const dataRetornoFutura = isBefore(hoje, startOfDay(r.dataRetorno));
                    const agendamentoDeHoje = r.agendamento_retorno_id
                      ? agendamentoRetornoPorId.get(r.agendamento_retorno_id)
                      : undefined;
                    const horarioAindaNaoChegou = Boolean(
                      r.data_retorno_prevista === todaySaoPauloDateOnly(agora) && r.agendamento_retorno_id &&
                      (!agendamentoDeHoje || !horarioAgendadoJaChegou(agendamentoDeHoje.data, agendamentoDeHoje.hora_inicio, agora)),
                    );
                    const agendamentoSemComparecimento = ['cancelado', 'faltou'].includes(agendamentoDeHoje?.status || '');
                    const atendimentoAindaAberto = Boolean(
                      r.agendamento_retorno_id && !podeMarcarRetornoRealizado(agendamentoDeHoje?.status),
                    );
                    const emAberto = !['realizado', 'cancelado'].includes(r.statusCalculado);
                    const muitoAtrasado = r.statusCalculado === 'atrasado' && r.diasAtraso > 30;
                    return (
                      <TableRow
                        key={r.id}
                        className={cn(
                          r.statusCalculado === 'atrasado' && 'bg-destructive/5',
                          muitoAtrasado && 'bg-destructive/10',
                          r.statusCalculado === 'cancelado' && 'text-muted-foreground',
                        )}
                      >
                        <TableCell className="font-medium text-foreground">{getPacienteNome(r.paciente_id)}</TableCell>
                        <TableCell className="text-sm">{getMedicoNome(r.medico_id)}</TableCell>
                        <TableCell>
                          <div>
                            <span className="text-sm tabular-nums">{format(r.dataRetorno, 'dd/MM/yyyy', { locale: ptBR })}</span>
                            {r.statusCalculado === 'atrasado' && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs font-medium text-destructive">
                                <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
                                {r.diasAtraso} dia(s) de atraso
                                {muitoAtrasado && (
                                  <Badge variant="destructive" className="rounded-full px-1.5 py-0 text-[10px] font-semibold">+30 dias</Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell max-w-[240px] align-top text-sm text-muted-foreground">
                          <span className="line-clamp-2 break-words" title={r.motivo || undefined}>
                            {r.motivo || '—'}
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(r.statusCalculado)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {(r.statusCalculado === 'pendente' || r.statusCalculado === 'atrasado') && !r.agendamento_retorno_id && (
                              <Button
                                size="sm"
                                onClick={() => handleAgendarRetorno(r)}
                                className="h-9 gap-1 rounded-full bg-gradient-primary text-xs text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110"
                              >
                                <CalendarPlus aria-hidden="true" className="h-3.5 w-3.5" /> Agendar
                              </Button>
                            )}
                            {r.agendamento_retorno_id && emAberto && (
                              <Button size="sm" variant="outline" onClick={() => void handleRemarcarRetorno(r)} disabled={isAgendando} className="h-9 gap-1 rounded-full text-xs">
                                {isAgendando ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />} Remarcar
                              </Button>
                            )}
                            {emAberto && !dataRetornoFutura && !horarioAindaNaoChegou && !agendamentoSemComparecimento && !atendimentoAindaAberto && (
                              <Button size="sm" onClick={() => setRealizando(r)} className="h-9 gap-1 rounded-full bg-gradient-primary text-xs text-white hover:brightness-110">
                                <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> Realizado
                              </Button>
                            )}
                            {emAberto && atendimentoAindaAberto && !agendamentoSemComparecimento && (
                              <span className="inline-flex items-center gap-1 px-2 text-xs text-muted-foreground" role="status">
                                <Clock aria-hidden="true" className="h-3 w-3" /> Conclua o atendimento antes de marcar como realizado
                              </span>
                            )}
                            {emAberto && (dataRetornoFutura || horarioAindaNaoChegou) && (
                              <span className="inline-flex items-center gap-1 px-2 text-xs text-muted-foreground" role="status">
                                <Clock aria-hidden="true" className="h-3 w-3" /> {horarioAindaNaoChegou ? 'Disponível após o horário agendado' : 'Disponível na data prevista'}
                              </span>
                            )}
                            {emAberto && agendamentoSemComparecimento && (
                              <span className="inline-flex items-center gap-1 px-2 text-xs text-muted-foreground" role="status">
                                <Ban aria-hidden="true" className="h-3 w-3" /> Agendamento cancelado ou falta
                              </span>
                            )}
                            {r.statusCalculado === 'realizado' && (
                              <Button
                                size="sm" variant="outline" className="h-9 gap-1 rounded-full text-xs text-muted-foreground"
                                aria-label="Reabrir retorno marcado como realizado"
                                onClick={() => void desfazerRealizado(r)}
                              >
                                <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Reabrir
                              </Button>
                            )}
                            {emAberto && (
                              <Button size="sm" variant="ghost" onClick={() => setCancelando(r)} className="h-9 gap-1 rounded-full text-xs text-destructive hover:text-destructive" aria-label="Cancelar retorno">
                                <Ban aria-hidden="true" className="h-3.5 w-3.5" /> Cancelar
                              </Button>
                            )}
                            {whatsapp && (
                              <Button aria-label="Contatar via WhatsApp" size="icon" variant="ghost" asChild className="h-9 w-9 shrink-0 rounded-full text-[#1080CA] hover:bg-[#1080CA]/10 hover:text-[#1080CA]">
                                <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Contatar via WhatsApp" title="Contatar via WhatsApp">
                                  <MessageCircle className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
              <CalendarPlus className="h-5 w-5 text-[#1080CA]" />
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
                <Label htmlFor="retorno-data">Data do Agendamento</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button id="retorno-data" type="button" aria-label="Selecionar data do agendamento" variant="outline" className={cn("w-full justify-start text-left font-normal", !dataAgendamento && "text-muted-foreground")}>
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
                <Label htmlFor="retorno-horario">Horário</Label>
                <Input id="retorno-horario" type="time" value={horaAgendamento} onChange={e => setHoraAgendamento(e.target.value)} />
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
          realizando ? ` previsto para ${format(parseDateOnly(realizando.data_retorno_prevista)!, 'dd/MM/yyyy')}` : ''
        }?`}
        confirmLabel="Sim, foi realizado"
        onConfirm={() => realizando && void marcarRealizado(realizando)}
        isLoading={isRealizando}
        closeOnConfirm={false}
      />
    </div>
  );
}
