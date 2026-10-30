import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseDateOnly } from '@/lib/dateOnly';
import { ptBR } from 'date-fns/locale';
import { Calendar, CalendarCheck, Check, AlertCircle, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/erros';
import { cn } from '@/lib/utils';

interface Return {
  id: string;
  paciente_id: string;
  prontuario_id: string | null;
  medico_id: string | null;
  data_consulta_origem: string;
  data_retorno_prevista: string;
  motivo: string | null;
  tipo_retorno: string;
  status: string;
  agendamento_id: string | null;
  agendamento_retorno_id: string | null;
  clinica_id: string | null;
  lembrete_enviado: boolean;
  observacoes: string | null;
}

interface ReturnSchedulerProps {
  pacienteId: string;
  className?: string;
  compact?: boolean;
  onSchedule: () => void;
  scheduleDisabled?: boolean;
}

const RETURN_TYPES = [
  { value: 'acompanhamento', label: 'Acompanhamento' },
  { value: 'resultado_exame', label: 'Resultado de Exame' },
  { value: 'avaliacao_tratamento', label: 'Avaliação de Tratamento' },
  { value: 'controle', label: 'Controle' },
  { value: 'outro', label: 'Outro' },
];

export function ReturnScheduler({ pacienteId, className, compact = false, onSchedule, scheduleDisabled = false }: ReturnSchedulerProps) {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();

  const { data: returns, isLoading, isError: returnsError, error: returnsLoadError, refetch: refetchReturns } = useQuery({
    queryKey: ['patient-returns', profile?.clinica_id, pacienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retornos')
        .select('*')
        .eq('paciente_id', pacienteId)
        .eq('clinica_id', profile!.clinica_id!)
        .order('data_retorno_prevista', { ascending: true });

      if (error) throw error;
      return data as Return[];
    },
    enabled: !!pacienteId && !!profile?.clinica_id,
  });

  const updateReturnStatus = useMutation({
    mutationFn: async ({ id, status, expectedStatus }: { id: string; status: string; expectedStatus: string }) => {
      if (!profile?.clinica_id) throw new Error('Clínica ativa não encontrada. Atualize a sessão e tente novamente.');
      const { data, error } = await supabase
        .from('retornos')
        .update({ status })
        .eq('id', id)
        .eq('clinica_id', profile.clinica_id)
        .eq('status', expectedStatus)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('O status deste retorno mudou em outra sessão. Atualize a lista antes de tentar novamente.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-returns', profile?.clinica_id, pacienteId] });
      toast.success('Status atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar status', { description: mensagemDeErro(error) });
    },
  });

  const pendingReturns = returns?.filter(item => item.status === 'pendente') || [];
  const completedReturns = returns?.filter(item => item.status !== 'pendente') || [];

  const scheduleButton = (
    <Button type="button" variant={compact ? 'outline' : 'default'} size="sm" onClick={onSchedule} disabled={scheduleDisabled}>
      <CalendarCheck className="mr-2 h-4 w-4" />
      Agendar Retorno
      {pendingReturns.length > 0 && <Badge variant="secondary" className="ml-2">{pendingReturns.length}</Badge>}
    </Button>
  );

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {returnsError && (
          <div role="alert" className="text-xs text-destructive">
            Não foi possível carregar os retornos.{' '}
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void refetchReturns()}>Tentar novamente</Button>
          </div>
        )}
        {scheduleButton}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5" />
          Retornos Agendados
        </CardTitle>
        {scheduleButton}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{[1, 2].map(index => <Skeleton key={index} className="h-16 w-full" />)}</div>
        ) : returnsError ? (
          <div role="alert" className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-destructive">Não foi possível carregar os retornos.</p>
            <p className="text-xs text-muted-foreground">{mensagemDeErro(returnsLoadError)}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetchReturns()}>Tentar novamente</Button>
          </div>
        ) : pendingReturns.length === 0 && completedReturns.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Nenhum retorno agendado.</p>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-5">
              {pendingReturns.length > 0 && (
                <section aria-labelledby="patient-returns-pending">
                  <h3 id="patient-returns-pending" className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <AlertCircle className="h-4 w-4 text-warning" />Pendentes ({pendingReturns.length})
                  </h3>
                  <div className="space-y-2">
                    {pendingReturns.map(item => (
                      <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{format(parseDateOnly(item.data_retorno_prevista)!, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                            <Badge variant="outline" className="border-warning/40 text-warning-foreground">Pendente</Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {RETURN_TYPES.find(type => type.value === item.tipo_retorno)?.label || item.tipo_retorno}
                            {item.motivo && ` · ${item.motivo}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="min-h-10 text-success hover:bg-success/5"
                            aria-label="Marcar retorno como concluído"
                            disabled={updateReturnStatus.isPending}
                            onClick={() => updateReturnStatus.mutate({ id: item.id, status: 'concluido', expectedStatus: item.status })}
                          >
                            <Check className="mr-2 h-4 w-4" />Concluir
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="min-h-10 text-destructive hover:bg-destructive/5"
                            aria-label="Cancelar retorno"
                            disabled={updateReturnStatus.isPending}
                            onClick={() => updateReturnStatus.mutate({ id: item.id, status: 'cancelado', expectedStatus: item.status })}
                          >
                            <X className="mr-2 h-4 w-4" />Cancelar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {completedReturns.length > 0 && (
                <section aria-labelledby="patient-returns-history">
                  <h3 id="patient-returns-history" className="mb-2 text-sm font-semibold">Histórico ({completedReturns.length})</h3>
                  <div className="space-y-2">
                    {completedReturns.map(item => (
                      <div key={item.id} className="rounded-lg border border-border/70 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{format(parseDateOnly(item.data_retorno_prevista)!, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                          <Badge variant="outline">{item.status === 'concluido' ? 'Concluído' : item.status === 'cancelado' ? 'Cancelado' : item.status}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {RETURN_TYPES.find(type => type.value === item.tipo_retorno)?.label || item.tipo_retorno}
                          {item.motivo && ` · ${item.motivo}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
