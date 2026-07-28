import { useState } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  CalendarCheck, 
  Plus, 
  Clock, 
  Calendar,
  Check,
  X,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { parseDateOnly } from '@/lib/dateOnly';

interface Return {
  id: string;
  paciente_id: string;
  prontuario_id: string | null;
  medico_id: string;
  data_consulta_origem: string;
  data_retorno_prevista: string;
  motivo: string | null;
  tipo_retorno: string;
  status: string;
  agendamento_id: string | null;
  lembrete_enviado: boolean;
  observacoes: string | null;
}

interface ReturnSchedulerProps {
  pacienteId: string;
  prontuarioId?: string;
  medicoId: string;
  className?: string;
  compact?: boolean;
}

const RETURN_PRESETS = [
  { label: '7 dias', value: '7d', calc: () => addDays(new Date(), 7) },
  { label: '15 dias', value: '15d', calc: () => addDays(new Date(), 15) },
  { label: '30 dias', value: '30d', calc: () => addDays(new Date(), 30) },
  { label: '2 meses', value: '2m', calc: () => addMonths(new Date(), 2) },
  { label: '3 meses', value: '3m', calc: () => addMonths(new Date(), 3) },
  { label: '6 meses', value: '6m', calc: () => addMonths(new Date(), 6) },
];

const RETURN_TYPES = [
  { value: 'acompanhamento', label: 'Acompanhamento' },
  { value: 'resultado_exame', label: 'Resultado de Exame' },
  { value: 'avaliacao_tratamento', label: 'Avaliação de Tratamento' },
  { value: 'controle', label: 'Controle' },
  { value: 'outro', label: 'Outro' },
];

export function ReturnScheduler({
  pacienteId,
  prontuarioId,
  medicoId,
  className,
  compact = false,
}: ReturnSchedulerProps) {
  const { profile } = useSupabaseAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [customDate, setCustomDate] = useState('');
  const [tipoRetorno, setTipoRetorno] = useState('acompanhamento');
  const [motivo, setMotivo] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const queryClient = useQueryClient();

  const { data: returns, isLoading } = useQuery({
    queryKey: ['patient-returns', pacienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retornos')
        .select('*')
        .eq('paciente_id', pacienteId)
        .order('data_retorno_prevista', { ascending: true });

      if (error) throw error;
      return data as Return[];
    },
    enabled: !!pacienteId,
  });

  const createReturn = useMutation({
    mutationFn: async () => {
      let dataRetorno: Date;
      
      if (selectedPreset) {
        const preset = RETURN_PRESETS.find(p => p.value === selectedPreset);
        dataRetorno = preset?.calc() || new Date();
      } else if (customDate) {
        dataRetorno = new Date(customDate);
      } else {
        throw new Error('Selecione uma data de retorno');
      }

      const { error } = await supabase.from('retornos').insert({
        paciente_id: pacienteId,
        prontuario_id: prontuarioId || null,
        medico_id: medicoId,
        data_retorno_prevista: format(dataRetorno, 'yyyy-MM-dd'),
        tipo_retorno: tipoRetorno,
        motivo: motivo || null,
        observacoes: observacoes || null,
        clinica_id: profile?.clinica_id || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-returns', pacienteId] });
      toast.success('Retorno agendado com sucesso!');
      resetForm();
      setIsOpen(false);
    },
    onError: (error) => {
      console.error('Erro ao agendar retorno:', error);
      toast.error('Erro ao agendar retorno');
    },
  });

  const updateReturnStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('retornos')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-returns', pacienteId] });
      toast.success('Status atualizado!');
    },
    onError: () => {
      toast.error('Erro ao atualizar status');
    },
  });

  const resetForm = () => {
    setSelectedPreset('');
    setCustomDate('');
    setTipoRetorno('acompanhamento');
    setMotivo('');
    setObservacoes('');
  };

  const pendingReturns = returns?.filter(r => r.status === 'pendente') || [];
  const completedReturns = returns?.filter(r => r.status !== 'pendente') || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pendente':
        return <Badge variant="outline" className="text-amber-600 border-amber-300">Pendente</Badge>;
      case 'agendado':
        return <Badge variant="outline" className="text-blue-600 border-blue-300">Agendado</Badge>;
      case 'concluido':
        return <Badge variant="outline" className="text-green-600 border-green-300">Concluído</Badge>;
      case 'cancelado':
        return <Badge variant="outline" className="text-red-600 border-red-300">Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <CalendarCheck className="h-4 w-4 mr-2" />
              Agendar Retorno
              {pendingReturns.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {pendingReturns.length}
                </Badge>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agendar Retorno</DialogTitle>
              <DialogDescription>
                Agende um retorno para acompanhamento do paciente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Quick presets */}
              <div>
                <Label>Retorno em:</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {RETURN_PRESETS.map((preset) => (
                    <Button
                      key={preset.value}
                      type="button"
                      variant={selectedPreset === preset.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSelectedPreset(preset.value);
                        setCustomDate('');
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">ou</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div>
                <Label htmlFor="custom-date">Data específica</Label>
                <Input
                  id="custom-date"
                  type="date"
                  value={customDate}
                  onChange={(e) => {
                    setCustomDate(e.target.value);
                    setSelectedPreset('');
                  }}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="tipo-retorno">Tipo de Retorno</Label>
                <Select value={tipoRetorno} onValueChange={setTipoRetorno}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RETURN_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="motivo">Motivo (opcional)</Label>
                <Input
                  id="motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex: Avaliar resposta ao tratamento"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="observacoes">Observações (opcional)</Label>
                <Textarea
                  id="observacoes"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Observações adicionais..."
                  rows={2}
                  className="mt-1"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => createReturn.mutate()}
                disabled={(!selectedPreset && !customDate) || createReturn.isPending}
              >
                {createReturn.isPending ? 'Agendando...' : 'Agendar Retorno'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5" />
            Retornos Agendados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5" />
          Retornos Agendados
        </CardTitle>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo Retorno
            </Button>
          </DialogTrigger>
          <DialogContent>
            {/* Same dialog content as compact version */}
            <DialogHeader>
              <DialogTitle>Agendar Retorno</DialogTitle>
              <DialogDescription>
                Agende um retorno para acompanhamento do paciente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label>Retorno em:</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {RETURN_PRESETS.map((preset) => (
                    <Button
                      key={preset.value}
                      type="button"
                      variant={selectedPreset === preset.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSelectedPreset(preset.value);
                        setCustomDate('');
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">ou</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div>
                <Label htmlFor="custom-date-full">Data específica</Label>
                <Input
                  id="custom-date-full"
                  type="date"
                  value={customDate}
                  onChange={(e) => {
                    setCustomDate(e.target.value);
                    setSelectedPreset('');
                  }}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="tipo-retorno-full">Tipo de Retorno</Label>
                <Select value={tipoRetorno} onValueChange={setTipoRetorno}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RETURN_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="motivo-full">Motivo (opcional)</Label>
                <Input
                  id="motivo-full"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex: Avaliar resposta ao tratamento"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="observacoes-full">Observações (opcional)</Label>
                <Textarea
                  id="observacoes-full"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Observações adicionais..."
                  rows={2}
                  className="mt-1"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => createReturn.mutate()}
                disabled={(!selectedPreset && !customDate) || createReturn.isPending}
              >
                {createReturn.isPending ? 'Agendando...' : 'Agendar Retorno'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          {pendingReturns.length === 0 && completedReturns.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum retorno agendado.
            </p>
          ) : (
            <div className="space-y-4">
              {pendingReturns.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Pendentes ({pendingReturns.length})
                  </h4>
                  <div className="space-y-2">
                    {pendingReturns.map((ret) => (
                      <div
                        key={ret.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {format(parseDateOnly(ret.data_retorno_prevista)!, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                            </span>
                            {getStatusBadge(ret.status)}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {RETURN_TYPES.find(t => t.value === ret.tipo_retorno)?.label || ret.tipo_retorno}
                            {ret.motivo && ` - ${ret.motivo}`}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => updateReturnStatus.mutate({ id: ret.id, status: 'concluido' })}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => updateReturnStatus.mutate({ id: ret.id, status: 'cancelado' })}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {completedReturns.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                    Histórico ({completedReturns.length})
                  </h4>
                  <div className="space-y-2">
                    {completedReturns.slice(0, 5).map((ret) => (
                      <div
                        key={ret.id}
                        className="flex items-center justify-between p-3 border rounded-lg opacity-60"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {format(parseDateOnly(ret.data_retorno_prevista)!, "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                            {getStatusBadge(ret.status)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {RETURN_TYPES.find(t => t.value === ret.tipo_retorno)?.label || ret.tipo_retorno}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
