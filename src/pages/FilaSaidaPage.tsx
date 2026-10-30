import { useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, Loader2, UserRoundX } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';
import { FILA_REMOVAL_REASONS, isFilaRemovalReason } from '@/lib/filaRemoval';
import { formatWithDatePreference as format } from '@/lib/datePreference';
import { parseDateOnly } from '@/lib/dateOnly';

interface QueueRemovalRecord {
  id: string;
  agendamento_id: string;
  status: string;
  horario_chegada: string | null;
  prioridade: string | null;
  agendamentos: {
    data: string | null;
    hora_inicio: string | null;
    status: string | null;
    pacientes: { nome: string | null; nome_social: string | null } | null;
    medicos: { nome: string | null; crm: string | null } | null;
  } | null;
}

const STATUSES_REMOVIVEIS = new Set(['aguardando', 'chamado', 'em_atendimento']);

function horarioLocal(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(parsed);
}

export default function FilaSaidaPage() {
  const { filaId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const routeState = location.state as { returnTo?: unknown } | null;
  const returnTo = typeof routeState?.returnTo === 'string' && /^\/fila(?:\?.*)?$/.test(routeState.returnTo)
    ? routeState.returnTo
    : '/fila';
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const completed = useRef(false);
  const submissionLock = useRef(false);

  const queueQuery = useQuery({
    queryKey: ['fila-item-remocao', profile?.clinica_id ?? null, filaId],
    enabled: Boolean(profile?.clinica_id && filaId),
    queryFn: async () => {
      if (!profile?.clinica_id || !filaId) return null;
      const { data, error } = await supabase.from('fila_atendimento')
        .select('id, agendamento_id, status, horario_chegada, prioridade, agendamentos(data, hora_inicio, status, pacientes(nome, nome_social), medicos(nome, crm))')
        .eq('id', filaId)
        .eq('clinica_id', profile.clinica_id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as QueueRemovalRecord | null;
    },
  });

  const patient = queueQuery.data?.agendamentos?.pacientes;
  const patientName = patient?.nome_social || patient?.nome || 'Paciente';
  const appointment = queueQuery.data?.agendamentos;
  const statusRemovivel = Boolean(queueQuery.data && STATUSES_REMOVIVEIS.has(queueQuery.data.status));

  const returnToQueue = () => navigate(returnTo, { replace: true });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const item = queueQuery.data;
    if (submissionLock.current || !item || !isFilaRemovalReason(reason) || !statusRemovivel) return;
    submissionLock.current = true;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('remover_item_fila_com_motivo', {
        p_fila_id: item.id,
        p_status_esperado: item.status,
        p_motivo: reason,
      });
      if (error) {
        const refreshed = await queueQuery.refetch();
        if (!refreshed.data || !STATUSES_REMOVIVEIS.has(refreshed.data.status)) {
          toast.warning('A fila mudou durante a operação. Confira o estado atualizado antes de repetir.');
          await queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
          returnToQueue();
          return;
        }
        toast.error('Não foi possível remover da fila', { description: mensagemDeErro(error) });
        return;
      }
      const result = data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : null;
      if (result?.removido !== true) {
        await queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] });
        await queryClient.invalidateQueries({ queryKey: ['fila-atendimento-eventos'] });
        toast.warning('O estado do paciente mudou. A fila foi atualizada antes de concluir a remoção.');
        returnToQueue();
        return;
      }

      completed.current = true;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] }),
        queryClient.invalidateQueries({ queryKey: ['fila-atendimento-eventos'] }),
      ]);
      toast.info('Paciente removido da fila', {
        description: result.atendimento_reaberto === true
          ? 'O atendimento voltou para “aguardando” e pode ser chamado novamente.'
          : 'O agendamento foi preservado.',
      });
      returnToQueue();
    } catch (error) {
      toast.error('Não foi possível concluir a remoção', { description: mensagemDeErro(error) });
    } finally {
      submissionLock.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <UnsavedChangesGuard dirty={Boolean(reason)} busy={saving} completed={completed} />
      <PageHeader
        title="Remover paciente da fila"
        description="Registre o motivo e confira o que acontece com o atendimento antes de confirmar."
        icon={<UserRoundX />}
        actions={<Button type="button" variant="outline" className="rounded-full" onClick={returnToQueue}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar para a fila</Button>}
      />

      {queueQuery.isPending ? (
        <p role="status" className="py-8 text-sm text-muted-foreground">Carregando o atendimento…</p>
      ) : queueQuery.isError ? (
        <ErrorState title="Não foi possível conferir o atendimento" description="A remoção foi pausada porque o estado atual da fila não está disponível." error={queueQuery.error} onRetry={() => void queueQuery.refetch()} />
      ) : !queueQuery.data ? (
        <ErrorState title="Este paciente não está mais na fila" description="A lista pode ter sido atualizada por outra pessoa. Volte à fila para conferir o estado atual." onRetry={returnToQueue} />
      ) : !statusRemovivel ? (
        <ErrorState title="Este atendimento não pode ser removido da fila" description="O estado atual já não permite esta ação. Volte à fila para revisar o registro atualizado." onRetry={returnToQueue} />
      ) : (
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Atendimento selecionado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                  <p className="text-lg font-semibold text-foreground">{patientName}</p>
                  <p className="text-sm text-muted-foreground">{appointment?.medicos?.nome || 'Profissional não informado'}{appointment?.medicos?.crm ? ` · CRM ${appointment.medicos.crm}` : ''}</p>
                </div>
                <Badge variant="outline">{queueQuery.data.status === 'em_atendimento' ? 'Em atendimento' : queueQuery.data.status === 'chamado' ? 'Chamado' : 'Aguardando'}</Badge>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-muted-foreground">Data</dt><dd className="font-medium">{appointment?.data ? format(parseDateOnly(appointment.data)!, 'dd/MM/yyyy') : '—'}</dd></div>
                <div><dt className="text-muted-foreground">Horário</dt><dd className="font-medium">{appointment?.hora_inicio?.slice(0, 5) || '—'}</dd></div>
                <div><dt className="text-muted-foreground">Chegada</dt><dd className="font-medium">{horarioLocal(queueQuery.data.horario_chegada)}</dd></div>
              </dl>
            </CardContent>
          </Card>

          <section aria-labelledby="fila-saida-heading" className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
            <div className="space-y-1">
              <h2 id="fila-saida-heading" className="text-base font-semibold">Motivo da saída</h2>
              <p className="text-sm text-muted-foreground">O motivo ficará registrado no histórico operacional da clínica.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fila-motivo-saida">Selecione o motivo</Label>
              <Select value={reason} onValueChange={setReason} disabled={saving}>
                <SelectTrigger id="fila-motivo-saida" aria-label="Motivo da saída">
                  <SelectValue placeholder="Escolha uma opção" />
                </SelectTrigger>
                <SelectContent>
                  {FILA_REMOVAL_REASONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
              <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {queueQuery.data.status === 'em_atendimento'
                ? 'O atendimento em andamento voltará para “aguardando” e poderá ser chamado novamente.'
                : 'O paciente sairá da fila. O agendamento será preservado.'}
            </p>
          </section>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="rounded-full" disabled={saving} onClick={returnToQueue}>Cancelar</Button>
            <Button type="submit" variant="destructive" className="gap-2 rounded-full" disabled={!isFilaRemovalReason(reason) || saving}>
              {saving && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
              {saving ? 'Removendo…' : 'Confirmar remoção'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
