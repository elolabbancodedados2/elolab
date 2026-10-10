import { nomeMedico } from '@/lib/formatters';
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Search, ArrowRightLeft, Filter, FileText, Clock, CheckCircle2,
  AlertTriangle, Plus, Eye, Loader2, Stethoscope, User, Send, Edit,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useMedicos } from '@/hooks/useSupabaseData';
import { useBuscaPacientes, usePacienteResumo } from '@/hooks/useBuscaPacientes';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { EncaminhamentoMedico } from '@/components/clinical/EncaminhamentoMedico';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { ErrorState } from '@/components/ErrorState';
import { normalizarTexto, pacienteCorresponde } from '@/lib/buscaPaciente';

interface EncaminhamentoData {
  id: string;
  paciente_id: string;
  prontuario_id: string | null;
  medico_origem_id: string;
  medico_destino_id: string | null;
  especialidade_destino: string;
  tipo: string | null;
  urgencia: string | null;
  motivo: string;
  hipotese_diagnostica: string | null;
  cid_principal: string | null;
  exames_realizados: string | null;
  tratamento_atual: string | null;
  informacoes_adicionais: string | null;
  status: string | null;
  data_encaminhamento: string | null;
  data_atendimento: string | null;
  contra_referencia: string | null;
  data_contra_referencia: string | null;
  created_at: string | null;
  updated_at: string | null;
  paciente?: { nome: string; nome_social?: string | null; cpf?: string | null; telefone?: string | null; email?: string | null } | null;
  medico_origem?: { nome: string | null; crm: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pendente: { label: 'Pendente', className: 'bg-warning/10 text-warning border-warning/20' },
  em_andamento: { label: 'Em Andamento', className: 'bg-info/10 text-info border-info/20' },
  concluido: { label: 'Concluído', className: 'bg-success/10 text-success border-success/20' },
  cancelado: { label: 'Cancelado', className: 'bg-muted text-muted-foreground' },
};

const URGENCIA_CONFIG: Record<string, { label: string; className: string }> = {
  eletivo: { label: 'Eletivo', className: 'bg-muted text-muted-foreground' },
  normal: { label: 'Normal', className: 'bg-success/10 text-success' },
  urgente: { label: 'Urgente', className: 'bg-warning/10 text-warning' },
  emergencia: { label: 'Emergência', className: 'bg-destructive/10 text-destructive' },
};

export default function Encaminhamentos() {
  const [searchTerm, setSearchTerm] = useState('');
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [selectedPacienteId, setSelectedPacienteId] = useState<string | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedEnc, setSelectedEnc] = useState<EncaminhamentoData | null>(null);
  const [contraRefText, setContraRefText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();
  const { medicoId } = useCurrentMedico();
  const medicosQuery = useMedicos();
  const pacientesBuscaQuery = useBuscaPacientes(patientSearchTerm, { limite: 50 });
  const pacientesBusca = pacientesBuscaQuery.data?.pacientes ?? [];
  const pacienteSelecionadoQuery = usePacienteResumo(selectedPacienteId);
  const medicos = medicosQuery.data || [];

  const encaminhamentosQuery = useQuery({
    queryKey: ['encaminhamentos', user?.id ?? null, profile?.clinica_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('encaminhamentos')
        .select(`*, paciente:pacientes(nome,nome_social,cpf,telefone,email), medico_origem:medicos!encaminhamentos_medico_origem_id_fkey(nome, crm)`)
        .eq('clinica_id', profile?.clinica_id ?? '')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as EncaminhamentoData[];
    },
    enabled: !!user && !!profile?.clinica_id,
  });
  const encaminhamentos = encaminhamentosQuery.data || [];

  const statusHistoryQuery = useQuery({
    queryKey: ['encaminhamento-status-history', profile?.clinica_id ?? null, selectedEnc?.id ?? null],
    enabled: isViewOpen && !!selectedEnc?.id && !!profile?.clinica_id,
    queryFn: async () => {
      if (!selectedEnc?.id || !profile?.clinica_id) return [];
      const { data, error } = await (supabase as any)
        .from('encaminhamento_status_history')
        .select('id,status_anterior,status_novo,usuario_id,usuario_nome,comentario,data_mudanca')
        .eq('encaminhamento_id', selectedEnc.id)
        .order('data_mudanca', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<Record<string, any>>;
    },
  });

  const isLoading = encaminhamentosQuery.isLoading || medicosQuery.isLoading;

  const getPacienteNome = (id: string) => {
    const paciente = encaminhamentos.find(enc => enc.paciente_id === id)?.paciente
      ?? pacientesBusca.find(p => p.id === id);
    return (paciente as any)?.nome_social || paciente?.nome || '—';
  };
  const getMedicoNome = (id: string) => {
    const m = medicos.find(m => m.id === id);
    return m ? `${nomeMedico(m.nome || m.crm)}` : '—';
  };

  const filteredEncaminhamentos = useMemo(() => {
    return encaminhamentos.filter(enc => {
      const paciente = enc.paciente;
      const termo = normalizarTexto(searchTerm);
      const matchesSearch = !termo ||
        (!!paciente && pacienteCorresponde(paciente, searchTerm)) ||
        normalizarTexto(enc.especialidade_destino || '').includes(termo) ||
        normalizarTexto(enc.motivo || '').includes(termo);
      const matchesStatus = statusFilter === 'todos' || enc.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [encaminhamentos, searchTerm, statusFilter]);

  // Stats
  const stats = useMemo(() => ({
    total: encaminhamentos.length,
    pendentes: encaminhamentos.filter(e => e.status === 'pendente').length,
    emAndamento: encaminhamentos.filter(e => e.status === 'em_andamento').length,
    concluidos: encaminhamentos.filter(e => e.status === 'concluido').length,
  }), [encaminhamentos]);

  // Pacientes with encaminhamentos for sidebar
  const pacientesComEnc = useMemo(() => {
    const countMap = new Map<string, number>();
    encaminhamentos.forEach(e => countMap.set(e.paciente_id, (countMap.get(e.paciente_id) || 0) + 1));
    return [...pacientesBusca].sort((a, b) => {
        const ca = countMap.get(a.id) || 0;
        const cb = countMap.get(b.id) || 0;
        return cb - ca;
      });
  }, [pacientesBusca, encaminhamentos]);

  const selectedPaciente = selectedPacienteId
    ? pacienteSelecionadoQuery.data ?? pacientesBusca.find(p => p.id === selectedPacienteId) ?? null
    : null;
  const pacienteEncaminhamentos = selectedPacienteId
    ? encaminhamentos.filter(e => e.paciente_id === selectedPacienteId)
    : [];

  const handleView = (enc: EncaminhamentoData) => {
    setSelectedEnc(enc);
    setContraRefText(enc.contra_referencia || '');
    setIsViewOpen(true);
  };

  const handleUpdateEncStatus = async (id: string, newStatus: string) => {
    if (isUpdating) return;
    if (!profile?.clinica_id) return toast.error('Clínica não identificada.');
    const current = encaminhamentos.find(enc => enc.id === id);
    const expectedStatuses = newStatus === 'em_andamento' ? ['pendente'] : ['pendente', 'em_andamento'];
    if (!current || !expectedStatuses.includes(current.status || '')) {
      return toast.error('O encaminhamento mudou de estado. Atualize a lista e tente novamente.');
    }
    setIsUpdating(true);
    try {
      const updateData: Record<string, any> = { status: newStatus };
      if (newStatus === 'em_andamento') updateData.data_atendimento = todaySaoPauloDateOnly();
      const { data, error } = await (supabase as any).from('encaminhamentos').update(updateData)
        .eq('id', id).eq('clinica_id', profile.clinica_id).in('status', expectedStatuses).select('id, updated_at').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O encaminhamento foi alterado em outra sessão. Atualize a lista antes de tentar novamente.');
      queryClient.invalidateQueries({ queryKey: ['encaminhamentos'] });
      void queryClient.invalidateQueries({ queryKey: ['encaminhamento-status-history', profile.clinica_id, id] });
      if (selectedEnc?.id === id) setSelectedEnc({ ...selectedEnc, status: newStatus, updated_at: data.updated_at } as any);
      toast.success(`Status atualizado para "${STATUS_CONFIG[newStatus]?.label || newStatus}"`);
    } catch (e) { toast.error('Erro ao atualizar status', { description: mensagemDeErro(e) }); }
    finally { setIsUpdating(false); }
  };

  const handleSaveContraRef = async () => {
    if (isUpdating) return;
    if (!selectedEnc || !contraRefText.trim()) return;
    if (!profile?.clinica_id) return toast.error('Clínica não identificada.');
    if (selectedEnc.status === 'concluido' || selectedEnc.status === 'cancelado') return toast.error('Este encaminhamento não aceita nova contra-referência.');
    if (!selectedEnc.updated_at) return toast.error('Não foi possível confirmar a versão deste encaminhamento. Atualize a lista e abra o registro novamente.');
    if (contraRefText.trim().length > 10000) return toast.error('A contra-referência deve ter no máximo 10.000 caracteres.');
    setIsUpdating(true);
    try {
      const { data, error } = await supabase.from('encaminhamentos').update({
        contra_referencia: contraRefText,
        data_contra_referencia: todaySaoPauloDateOnly(),
        status: 'concluido',
        data_atendimento: selectedEnc.data_atendimento || todaySaoPauloDateOnly(),
      }).eq('id', selectedEnc.id).eq('clinica_id', profile.clinica_id)
        .eq('updated_at', selectedEnc.updated_at)
        .in('status', ['pendente', 'em_andamento']).select('id, updated_at').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O encaminhamento foi alterado em outra sessão. Seu texto continua nesta tela; atualize o registro e confira o histórico antes de salvar novamente.');
      queryClient.invalidateQueries({ queryKey: ['encaminhamentos'] });
      void queryClient.invalidateQueries({ queryKey: ['encaminhamento-status-history', profile.clinica_id, selectedEnc.id] });
      setSelectedEnc({ ...selectedEnc, contra_referencia: contraRefText, status: 'concluido', updated_at: data.updated_at } as any);
      toast.success('Contra-referência registrada! Encaminhamento concluído.');
    } catch (e) { toast.error('Erro ao salvar contra-referência', { description: mensagemDeErro(e) }); }
    finally { setIsUpdating(false); }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const referralQueries = [encaminhamentosQuery, medicosQuery];
  const failedReferralQuery = referralQueries.find(query => query.isError);
  if (failedReferralQuery) {
    return <ErrorState title="Não foi possível carregar encaminhamentos" error={failedReferralQuery.error} onRetry={() => { for (const query of referralQueries) void query.refetch(); }} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <ArrowRightLeft className="h-8 w-8 text-primary" />
            Encaminhamentos
          </h1>
          <p className="text-muted-foreground">Referências e contra-referências médicas</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="kpi-card cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" role="button" tabIndex={0} aria-pressed={statusFilter === 'todos'} onClick={() => setStatusFilter('todos')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setStatusFilter('todos'); } }}>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className={cn("kpi-card cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", statusFilter === 'pendente' && "ring-2 ring-amber-500")} role="button" tabIndex={0} aria-pressed={statusFilter === 'pendente'} onClick={() => setStatusFilter('pendente')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setStatusFilter('pendente'); } }}>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums text-warning">{stats.pendentes}</div>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card className={cn("kpi-card cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", statusFilter === 'em_andamento' && "ring-2 ring-blue-500")} role="button" tabIndex={0} aria-pressed={statusFilter === 'em_andamento'} onClick={() => setStatusFilter('em_andamento')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setStatusFilter('em_andamento'); } }}>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums text-info">{stats.emAndamento}</div>
            <p className="text-xs text-muted-foreground">Em Andamento</p>
          </CardContent>
        </Card>
        <Card className={cn("kpi-card cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", statusFilter === 'concluido' && "ring-2 ring-green-500")} role="button" tabIndex={0} aria-pressed={statusFilter === 'concluido'} onClick={() => setStatusFilter('concluido')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setStatusFilter('concluido'); } }}>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums text-success">{stats.concluidos}</div>
            <p className="text-xs text-muted-foreground">Concluídos</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Patient List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Pacientes
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, CPF ou telefone..."
                value={patientSearchTerm}
                onChange={(e) => setPatientSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {pacientesBuscaQuery.isError ? (
                <div className="p-4">
                  <ErrorState compact title="Não foi possível buscar pacientes" error={pacientesBuscaQuery.error} onRetry={() => void pacientesBuscaQuery.refetch()} />
                </div>
              ) : pacientesBuscaQuery.isFetching || pacientesBuscaQuery.isDebouncing ? (
                <p role="status" className="px-4 py-10 text-center text-sm text-muted-foreground">Buscando pacientes…</p>
              ) : pacientesComEnc.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <p>{patientSearchTerm ? 'Nenhum paciente corresponde à busca.' : 'Nenhum paciente cadastrado.'}</p>
                  {patientSearchTerm && <Button variant="link" onClick={() => setPatientSearchTerm('')}>Limpar busca</Button>}
                </div>
              ) : pacientesComEnc.map((paciente) => {
                const qtd = encaminhamentos.filter(e => e.paciente_id === paciente.id).length;
                return (
                  <div
                    key={paciente.id}
                    className={cn(
                      'p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      selectedPacienteId === paciente.id && 'bg-primary/10 border-l-2 border-l-primary',
                    )}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedPacienteId === paciente.id}
                    onClick={() => setSelectedPacienteId(paciente.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedPacienteId(paciente.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm truncate">{(paciente as any).nome_social || paciente.nome}</p>
                      {qtd > 0 && (
                        <Badge variant="secondary" className="text-[10px] tabular-nums">{qtd}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </ScrollArea>
            {!pacientesBuscaQuery.isError && !pacientesBuscaQuery.isFetching && pacientesBuscaQuery.data?.incompleta && (
              <p role="status" className="border-t px-4 py-2 text-xs text-muted-foreground">
                {patientSearchTerm.trim()
                  ? 'Há mais pacientes com esse resultado. Refine a busca para localizar o próximo.'
                  : 'Mostrando os 50 pacientes mais recentes. Pesquise para localizar outros.'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Referral Panel */}
        <div className="lg:col-span-2">
          {selectedPacienteId && pacienteSelecionadoQuery.isError ? (
            <ErrorState
              title="Não foi possível carregar o paciente selecionado"
              description="Atualize os dados antes de criar ou consultar encaminhamentos para evitar usar uma ficha incorreta."
              error={pacienteSelecionadoQuery.error}
              onRetry={() => void pacienteSelecionadoQuery.refetch()}
            />
          ) : selectedPacienteId && pacienteSelecionadoQuery.isFetching && !selectedPaciente ? (
            <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Carregando a ficha do paciente…</CardContent></Card>
          ) : selectedPaciente && medicoId ? (
            <EncaminhamentoMedico
              pacienteId={selectedPaciente.id}
              pacienteNome={(selectedPaciente as any).nome_social || selectedPaciente.nome}
              medicoOrigemId={medicoId}
              encaminhamentos={pacienteEncaminhamentos}
              onEncaminhamentoCriado={() => queryClient.invalidateQueries({ queryKey: ['encaminhamentos'] })}
            />
          ) : (
            <Card>
              <CardContent className="py-16">
                <div className="text-center text-muted-foreground">
                  <ArrowRightLeft className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p className="font-medium">
                    {!medicoId
                      ? 'Seu perfil não está vinculado a um médico. Encaminhamentos requerem perfil médico.'
                      : 'Selecione um paciente para gerenciar encaminhamentos'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* All Referrals Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Todos os Encaminhamentos ({filteredEncaminhamentos.length})
            </CardTitle>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Paciente, CPF, especialidade ou motivo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-11 w-full pl-9 sm:w-56"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-11 w-full sm:w-[150px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Especialidade</TableHead>
                  <TableHead className="hidden md:table-cell">Médico Origem</TableHead>
                  <TableHead className="hidden md:table-cell">Urgência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Contra-ref.</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEncaminhamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      <ArrowRightLeft className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>{encaminhamentos.length === 0 ? 'Nenhum encaminhamento registrado' : 'Nenhum encaminhamento corresponde à busca e ao status selecionado'}</p>
                      {encaminhamentos.length > 0 && (
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => { setSearchTerm(''); setStatusFilter('todos'); }}>
                          Limpar filtros
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEncaminhamentos.map((enc) => {
                    const statusCfg = STATUS_CONFIG[enc.status || 'pendente'] || STATUS_CONFIG.pendente;
                    const urgCfg = URGENCIA_CONFIG[enc.urgencia || 'normal'] || URGENCIA_CONFIG.normal;
                    return (
                      <TableRow key={enc.id}>
                        <TableCell className="text-sm">
                          {enc.data_encaminhamento
                            ? format(parseDateOnly(enc.data_encaminhamento)!, 'dd/MM/yyyy')
                            : '—'}
                        </TableCell>
                        <TableCell className="font-medium">{enc.paciente?.nome_social || enc.paciente?.nome || getPacienteNome(enc.paciente_id)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">{enc.especialidade_destino}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {enc.medico_origem?.nome ? `${nomeMedico(enc.medico_origem.nome)}` : getMedicoNome(enc.medico_origem_id)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge className={cn(urgCfg.className)}>{urgCfg.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(statusCfg.className)}>{statusCfg.label}</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {enc.contra_referencia ? (
                            <Badge className="bg-success/10 text-success">Sim</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">Não</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleView(enc)} aria-label="Ver" disabled={isUpdating}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {enc.status === 'pendente' && (
                              <Button variant="outline" size="sm" className="text-xs" onClick={() => handleUpdateEncStatus(enc.id, 'em_andamento')} disabled={isUpdating}>
                                Iniciar
                              </Button>
                            )}
                            {enc.status === 'em_andamento' && (
                              <Button variant="outline" size="sm" className="text-xs" onClick={() => { handleView(enc); }} disabled={isUpdating}>
                                <Edit className="h-3 w-3 mr-1" />Contra-ref.
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* View Detail Dialog */}
      <Dialog open={isViewOpen} onOpenChange={(open) => { if (open || !isUpdating) setIsViewOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
              Detalhes do Encaminhamento
            </DialogTitle>
          </DialogHeader>
          {selectedEnc && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Paciente</p>
                  <p className="font-medium">{selectedEnc.paciente?.nome_social || selectedEnc.paciente?.nome || getPacienteNome(selectedEnc.paciente_id)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Especialidade</p>
                  <p className="font-medium">{selectedEnc.especialidade_destino}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Data</p>
                  <p>{selectedEnc.data_encaminhamento ? format(parseDateOnly(selectedEnc.data_encaminhamento)!, 'dd/MM/yyyy') : '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Urgência</p>
                  <Badge className={cn(URGENCIA_CONFIG[selectedEnc.urgencia || 'normal']?.className)}>
                    {URGENCIA_CONFIG[selectedEnc.urgencia || 'normal']?.label}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Badge className={cn(STATUS_CONFIG[selectedEnc.status || 'pendente']?.className)}>
                    {STATUS_CONFIG[selectedEnc.status || 'pendente']?.label}
                  </Badge>
                </div>
                {selectedEnc.cid_principal && (
                  <div>
                    <p className="text-muted-foreground text-xs">CID Principal</p>
                    <p>{selectedEnc.cid_principal}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Motivo</p>
                <p className="bg-muted/50 rounded-lg p-3">{selectedEnc.motivo}</p>
              </div>
              {selectedEnc.hipotese_diagnostica && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Hipótese Diagnóstica</p>
                  <p className="bg-muted/50 rounded-lg p-3">{selectedEnc.hipotese_diagnostica}</p>
                </div>
              )}
              {selectedEnc.tratamento_atual && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Tratamento Atual</p>
                  <p className="bg-muted/50 rounded-lg p-3">{selectedEnc.tratamento_atual}</p>
                </div>
              )}

              <Separator />

              <section className="space-y-2" aria-label="Histórico de status">
                <p className="text-xs font-semibold text-muted-foreground">Histórico do encaminhamento</p>
                {statusHistoryQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Carregando histórico…</p>
                ) : statusHistoryQuery.isError ? (
                  <ErrorState compact title="Não foi possível carregar o histórico" error={statusHistoryQuery.error} onRetry={() => void statusHistoryQuery.refetch()} />
                ) : statusHistoryQuery.data?.length ? (
                  <ol className="space-y-2 border-l pl-3">
                    {statusHistoryQuery.data.map((evento: Record<string, any>) => {
                      const anterior = evento.status_anterior
                        ? STATUS_CONFIG[evento.status_anterior]?.label || evento.status_anterior
                        : null;
                      const novo = STATUS_CONFIG[evento.status_novo]?.label || evento.status_novo;
                      return (
                        <li key={evento.id} className="relative text-xs">
                          <p className="font-medium">{anterior ? `${anterior} → ${novo}` : novo}</p>
                          {evento.comentario && <p className="text-muted-foreground">{evento.comentario}</p>}
                          <p className="text-muted-foreground">
                            {evento.usuario_nome || 'Usuário da clínica'} · {format(new Date(evento.data_mudanca), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-xs text-muted-foreground">Ainda não há alterações de status registradas.</p>
                )}
              </section>

              <Separator />

              {/* Contra-referência section */}
              {selectedEnc.contra_referencia ? (
                <div>
                  <p className="text-muted-foreground text-xs mb-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-success" /> Contra-referência
                    {selectedEnc.data_contra_referencia && (
                      <span className="ml-auto text-[10px]">{format(parseDateOnly(selectedEnc.data_contra_referencia)!, 'dd/MM/yyyy')}</span>
                    )}
                  </p>
                  <p className="bg-success/5 border border-success/20 rounded-lg p-3">{selectedEnc.contra_referencia}</p>
                </div>
              ) : selectedEnc.status !== 'cancelado' && selectedEnc.status !== 'concluido' ? (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs font-medium flex items-center gap-1">
                    <Send className="h-3 w-3" /> Registrar Contra-referência
                  </p>
                  <Textarea
                    placeholder="Informe o retorno do especialista, condutas sugeridas, diagnóstico final..."
                    value={contraRefText}
                    onChange={e => setContraRefText(e.target.value)}
                    rows={3}
                    disabled={isUpdating}
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveContraRef}
                    disabled={!contraRefText.trim() || isUpdating}
                    className="gap-1.5"
                  >
                    {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Salvar e Concluir
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          {/* Status actions in footer */}
          {selectedEnc && selectedEnc.status !== 'concluido' && selectedEnc.status !== 'cancelado' && (
            <DialogFooter className="gap-2">
              {selectedEnc.status === 'pendente' && (
                <Button variant="outline" size="sm" onClick={() => handleUpdateEncStatus(selectedEnc.id, 'em_andamento')} disabled={isUpdating}>
                  Marcar Em Andamento
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleUpdateEncStatus(selectedEnc.id, 'cancelado')} disabled={isUpdating}>
                Cancelar Encaminhamento
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
