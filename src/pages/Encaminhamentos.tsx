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
import { usePacientes, useMedicos } from '@/hooks/useSupabaseData';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { EncaminhamentoMedico } from '@/components/clinical/EncaminhamentoMedico';
import { parseDateOnly } from '@/lib/dateOnly';

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
  paciente?: { nome: string } | null;
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
  const [statusFilter, setStatusFilter] = useState('todos');
  const [selectedPacienteId, setSelectedPacienteId] = useState<string | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedEnc, setSelectedEnc] = useState<EncaminhamentoData | null>(null);
  const [contraRefText, setContraRefText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const queryClient = useQueryClient();
  const { medicoId } = useCurrentMedico();
  const { data: pacientes = [], isLoading: loadingPacientes } = usePacientes();
  const { data: medicos = [], isLoading: loadingMedicos } = useMedicos();

  const { data: encaminhamentos = [], isLoading: loadingEnc } = useQuery({
    queryKey: ['encaminhamentos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('encaminhamentos')
        .select(`*, paciente:pacientes(nome), medico_origem:medicos!encaminhamentos_medico_origem_id_fkey(nome, crm)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as EncaminhamentoData[];
    },
  });

  const isLoading = loadingEnc || loadingPacientes || loadingMedicos;

  const getPacienteNome = (id: string) => pacientes.find(p => p.id === id)?.nome || '—';
  const getMedicoNome = (id: string) => {
    const m = medicos.find(m => m.id === id);
    return m ? `Dr(a). ${m.nome || m.crm}` : '—';
  };

  const filteredEncaminhamentos = useMemo(() => {
    return encaminhamentos.filter(enc => {
      const matchesSearch = !searchTerm.trim() ||
        enc.paciente?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        enc.especialidade_destino.toLowerCase().includes(searchTerm.toLowerCase()) ||
        enc.motivo.toLowerCase().includes(searchTerm.toLowerCase());
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
    return pacientes
      .filter(p => p.nome.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        const ca = countMap.get(a.id) || 0;
        const cb = countMap.get(b.id) || 0;
        return cb - ca;
      });
  }, [pacientes, encaminhamentos, searchTerm]);

  const selectedPaciente = selectedPacienteId ? pacientes.find(p => p.id === selectedPacienteId) : null;
  const pacienteEncaminhamentos = selectedPacienteId
    ? encaminhamentos.filter(e => e.paciente_id === selectedPacienteId)
    : [];

  const handleView = (enc: EncaminhamentoData) => {
    setSelectedEnc(enc);
    setContraRefText(enc.contra_referencia || '');
    setIsViewOpen(true);
  };

  const handleUpdateEncStatus = async (id: string, newStatus: string) => {
    setIsUpdating(true);
    try {
      const updateData: Record<string, any> = { status: newStatus };
      if (newStatus === 'em_andamento') updateData.data_atendimento = new Date().toISOString().split('T')[0];
      const { error } = await (supabase as any).from('encaminhamentos').update(updateData).eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['encaminhamentos'] });
      if (selectedEnc?.id === id) setSelectedEnc({ ...selectedEnc, status: newStatus } as any);
      toast.success(`Status atualizado para "${STATUS_CONFIG[newStatus]?.label || newStatus}"`);
    } catch (e) { toast.error('Erro ao atualizar status', { description: mensagemDeErro(e) }); }
    setIsUpdating(false);
  };

  const handleSaveContraRef = async () => {
    if (!selectedEnc || !contraRefText.trim()) return;
    setIsUpdating(true);
    try {
      const { error } = await supabase.from('encaminhamentos').update({
        contra_referencia: contraRefText,
        data_contra_referencia: new Date().toISOString().split('T')[0],
        status: 'concluido',
      }).eq('id', selectedEnc.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['encaminhamentos'] });
      setSelectedEnc({ ...selectedEnc, contra_referencia: contraRefText, status: 'concluido' } as any);
      toast.success('Contra-referência registrada! Encaminhamento concluído.');
    } catch (e) { toast.error('Erro ao salvar contra-referência', { description: mensagemDeErro(e) }); }
    setIsUpdating(false);
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
        <Card className="kpi-card cursor-pointer" onClick={() => setStatusFilter('todos')}>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className={cn("kpi-card cursor-pointer", statusFilter === 'pendente' && "ring-2 ring-amber-500")} onClick={() => setStatusFilter('pendente')}>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums text-warning">{stats.pendentes}</div>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card className={cn("kpi-card cursor-pointer", statusFilter === 'em_andamento' && "ring-2 ring-blue-500")} onClick={() => setStatusFilter('em_andamento')}>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums text-info">{stats.emAndamento}</div>
            <p className="text-xs text-muted-foreground">Em Andamento</p>
          </CardContent>
        </Card>
        <Card className={cn("kpi-card cursor-pointer", statusFilter === 'concluido' && "ring-2 ring-green-500")} onClick={() => setStatusFilter('concluido')}>
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
                placeholder="Buscar paciente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {pacientesComEnc.map((paciente) => {
                const qtd = encaminhamentos.filter(e => e.paciente_id === paciente.id).length;
                return (
                  <div
                    key={paciente.id}
                    className={cn(
                      'p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors',
                      selectedPacienteId === paciente.id && 'bg-primary/10 border-l-2 border-l-primary',
                    )}
                    onClick={() => setSelectedPacienteId(paciente.id)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm truncate">{paciente.nome}</p>
                      {qtd > 0 && (
                        <Badge variant="secondary" className="text-[10px] tabular-nums">{qtd}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Referral Panel */}
        <div className="lg:col-span-2">
          {selectedPaciente && medicoId ? (
            <EncaminhamentoMedico
              pacienteId={selectedPaciente.id}
              pacienteNome={selectedPaciente.nome}
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
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-56"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
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
                      <p>Nenhum encaminhamento encontrado</p>
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
                        <TableCell className="font-medium">{enc.paciente?.nome || getPacienteNome(enc.paciente_id)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">{enc.especialidade_destino}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {enc.medico_origem?.nome ? `Dr(a). ${enc.medico_origem.nome}` : getMedicoNome(enc.medico_origem_id)}
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
                            <Button variant="ghost" size="icon" onClick={() => handleView(enc)} aria-label="Ver">
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
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
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
                  <p className="font-medium">{selectedEnc.paciente?.nome || getPacienteNome(selectedEnc.paciente_id)}</p>
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
