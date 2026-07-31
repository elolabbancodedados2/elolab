import { useState, useMemo, useCallback } from 'react';
import { format, parseISO, isPast, differenceInDays, addDays, isWithinInterval, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSupabaseQuery } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock, AlertTriangle, CheckCircle2, Phone, Clock, Filter, Search,
  CalendarPlus, CalendarDays, TrendingUp, Loader2, CalendarIcon,
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
}

export default function RetornosControl() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [agendarDialogOpen, setAgendarDialogOpen] = useState(false);
  const [retornoParaAgendar, setRetornoParaAgendar] = useState<Retorno | null>(null);
  const [dataAgendamento, setDataAgendamento] = useState<Date>();
  const [horaAgendamento, setHoraAgendamento] = useState('09:00');
  const [isAgendando, setIsAgendando] = useState(false);
  const queryClient = useQueryClient();

  const { data: retornos = [], isLoading: loadingRetornos } = useSupabaseQuery<Retorno>('retornos', {
    orderBy: { column: 'data_retorno_prevista', ascending: true },
  });

  const { data: pacientes = [], isLoading: loadingPacientes } = useSupabaseQuery<{ id: string; nome: string; telefone: string | null }>('pacientes', {
    select: 'id, nome, telefone',
  });

  const { data: medicos = [], isLoading: loadingMedicos } = useSupabaseQuery<{ id: string; nome: string | null; crm: string; especialidade: string | null }>('medicos', {
    select: 'id, nome, crm, especialidade',
  });

  const isLoading = loadingRetornos || loadingPacientes || loadingMedicos;

  const getPacienteNome = useCallback((id: string) => pacientes.find(p => p.id === id)?.nome || 'Paciente', [pacientes]);
  const getPacienteTelefone = useCallback((id: string) => pacientes.find(p => p.id === id)?.telefone || null, [pacientes]);
  const getMedicoNome = useCallback((id: string) => {
    const m = medicos.find(m => m.id === id);
    return m ? `Dr(a). ${m.nome || m.crm}` : 'Médico';
  }, [medicos]);

  const hoje = useMemo(() => new Date(), []);
  const retornosComStatus = useMemo(() => retornos.map(r => {
    const dataRetorno = parseISO(r.data_retorno_prevista);
    const diasAtraso = differenceInDays(hoje, dataRetorno);
    let statusCalculado = r.status || 'pendente';
    if (statusCalculado === 'pendente' && isPast(dataRetorno)) {
      statusCalculado = 'atrasado';
    }
    return { ...r, statusCalculado, diasAtraso, dataRetorno };
  }), [retornos, hoje]);

  const filtrados = useMemo(() => {
    return retornosComStatus.filter(r => {
      if (filtroStatus === 'proximos7') {
        const em7dias = addDays(startOfDay(hoje), 7);
        const dentroDe7 = isWithinInterval(r.dataRetorno, { start: startOfDay(hoje), end: em7dias });
        if (!dentroDe7 || r.statusCalculado === 'realizado' || r.statusCalculado === 'cancelado') return false;
      } else if (filtroStatus !== 'todos' && r.statusCalculado !== filtroStatus) {
        return false;
      }
      if (searchTerm.trim()) {
        const nome = getPacienteNome(r.paciente_id).toLowerCase();
        const medico = getMedicoNome(r.medico_id).toLowerCase();
        const term = searchTerm.toLowerCase();
        if (!nome.includes(term) && !medico.includes(term) && !(r.motivo || '').toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [retornosComStatus, filtroStatus, searchTerm, getPacienteNome, getMedicoNome, hoje]);

  const pendentes = retornosComStatus.filter(r => r.statusCalculado === 'pendente').length;
  const atrasados = retornosComStatus.filter(r => r.statusCalculado === 'atrasado').length;
  const realizados = retornosComStatus.filter(r => r.statusCalculado === 'realizado').length;
  const proximos7 = retornosComStatus.filter(r => {
    const em7dias = addDays(startOfDay(hoje), 7);
    return isWithinInterval(r.dataRetorno, { start: startOfDay(hoje), end: em7dias }) &&
      r.statusCalculado !== 'realizado' && r.statusCalculado !== 'cancelado';
  }).length;

  const taxaComparecimento = retornosComStatus.length > 0
    ? Math.round((realizados / retornosComStatus.filter(r => r.statusCalculado !== 'cancelado').length) * 100) || 0
    : 0;

  const marcarRealizado = async (id: string) => {
    const { error } = await supabase
      .from('retornos')
      .update({ status: 'realizado' } as any)
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar retorno');
    } else {
      toast.success('Retorno marcado como realizado');
      queryClient.invalidateQueries({ queryKey: ['retornos'] });
    }
  };

  const handleAgendarRetorno = (retorno: Retorno) => {
    setRetornoParaAgendar(retorno);
    setDataAgendamento(parseISO(retorno.data_retorno_prevista));
    setHoraAgendamento('09:00');
    setAgendarDialogOpen(true);
  };

  const confirmarAgendamento = async () => {
    if (!retornoParaAgendar || !dataAgendamento) {
      toast.error('Selecione uma data para o agendamento.');
      return;
    }

    setIsAgendando(true);
    try {
      const { data: agendamento, error } = await supabase
        .from('agendamentos')
        .insert({
          paciente_id: retornoParaAgendar.paciente_id,
          medico_id: retornoParaAgendar.medico_id,
          data: format(dataAgendamento, 'yyyy-MM-dd'),
          hora_inicio: horaAgendamento,
          tipo: 'retorno',
          observacoes: `Retorno: ${retornoParaAgendar.motivo || 'Consulta de retorno'}`,
          status: 'agendado',
        })
        .select('id')
        .single();

      if (error) throw error;

      // Vincular agendamento ao retorno
      await supabase
        .from('retornos')
        .update({ agendamento_id: agendamento.id, status: 'agendado' } as any)
        .eq('id', retornoParaAgendar.id);

      queryClient.invalidateQueries({ queryKey: ['retornos'] });
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      setAgendarDialogOpen(false);
      toast.success(`Retorno agendado para ${format(dataAgendamento, 'dd/MM/yyyy')} às ${horaAgendamento}`);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      toast.error('Erro ao criar agendamento de retorno.', { description: mensagemDeErro(error) });
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

  const kpis = [
    { key: 'atrasado', label: 'Atrasados', value: atrasados, icon: AlertTriangle, color: 'destructive' as const, ring: 'ring-destructive' },
    { key: 'pendente', label: 'Pendentes', value: pendentes, icon: CalendarClock, color: 'warning' as const, ring: 'ring-warning' },
    { key: 'proximos7', label: 'Próximos 7 dias', value: proximos7, icon: CalendarDays, color: 'primary' as const, ring: 'ring-primary' },
    { key: 'realizado', label: 'Realizados', value: realizados, icon: CheckCircle2, color: 'success' as const, ring: 'ring-success', extra: `${taxaComparecimento}% comparecimento` },
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
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar paciente, médico..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-44">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="atrasado">Atrasados</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="proximos7">Próximos 7 dias</SelectItem>
              <SelectItem value="realizado">Realizados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card
              className={cn("cursor-pointer transition-all hover:shadow-md", filtroStatus === kpi.key && `ring-2 ${kpi.ring}`)}
              onClick={() => setFiltroStatus(filtroStatus === kpi.key ? 'todos' : kpi.key)}
            >
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase">{kpi.label}</p>
                    <p className={cn("text-3xl font-bold tabular-nums", `text-${kpi.color}`)}>{kpi.value}</p>
                    {kpi.extra && <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1"><TrendingUp className="h-3 w-3" />{kpi.extra}</p>}
                  </div>
                  <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center", `bg-${kpi.color}/10`)}>
                    <kpi.icon className={cn("h-5 w-5", `text-${kpi.color}`)} />
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
              <p>Nenhum retorno encontrado</p>
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
                    {filtrados.map((r) => (
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
                          <div className="flex gap-1 justify-end">
                            {(r.statusCalculado === 'pendente' || r.statusCalculado === 'atrasado') && !r.agendamento_id && (
                              <Button size="sm" variant="outline" onClick={() => handleAgendarRetorno(r)} className="gap-1 text-primary border-primary/30 hover:bg-primary/5">
                                <CalendarPlus className="h-3 w-3" /> Agendar
                              </Button>
                            )}
                            {r.statusCalculado !== 'realizado' && (
                              <Button size="sm" variant="outline" onClick={() => marcarRealizado(r.id)} className="gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Realizado
                              </Button>
                            )}
                            {getPacienteTelefone(r.paciente_id) && (
                              <Button size="sm" variant="ghost" asChild aria-label="Contatar via WhatsApp">
                                <a href={`https://wa.me/55${getPacienteTelefone(r.paciente_id)?.replace(/\D/g, '')}`} target="_blank" rel="noopener">
                                  <Phone className="h-3 w-3" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agendar Retorno Dialog */}
      <Dialog open={agendarDialogOpen} onOpenChange={setAgendarDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" />
              Agendar Retorno
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
                      disabled={(date) => date < startOfDay(new Date())}
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
            <Button onClick={confirmarAgendamento} disabled={isAgendando} className="gap-2">
              {isAgendando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Confirmar Agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
