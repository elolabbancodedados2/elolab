import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';
import { PERFIS_LIBERACAO_EXCEPCIONAL } from '@/lib/filaBloqueio';

type ReleaseType = 'pagamento' | 'triagem';
type Appointment = {
  id: string;
  clinica_id: string;
  data: string;
  hora_inicio: string;
  status: string | null;
  exige_pagamento_previo: boolean;
  liberado_sem_pagamento: boolean;
  exige_triagem: boolean;
  liberado_sem_triagem: boolean;
  pacientes: { nome: string | null; nome_social: string | null } | null;
  medicos: { nome: string | null } | null;
};
type QueueEntry = { id: string; status: string | null; cobranca_estado: string };
type ClinicRules = { exigir_pagamento_previo: boolean | null; exigir_triagem: boolean | null };
type ReleaseContext = {
  appointment: Appointment;
  queue: QueueEntry | null;
  eligible: boolean;
  alreadyReleased: boolean;
  reason: string;
};
type RouteState = { returnTo?: unknown; patientName?: unknown };

const ACTIVE_QUEUE_STATUSES = ['aguardando', 'chamado', 'em_atendimento'];
const TERMINAL_APPOINTMENT_STATUSES = ['cancelado', 'faltou', 'finalizado', 'atendimento_finalizado'];

function getPatientName(appointment: Appointment, fallback: string) {
  return appointment.pacientes?.nome_social || appointment.pacientes?.nome || fallback || 'Paciente';
}

async function loadReleaseContext(clinicId: string, appointmentId: string, type: ReleaseType): Promise<ReleaseContext | null> {
  const [appointmentResult, clinicResult, queueResult] = await Promise.all([
    supabase.from('agendamentos')
      .select('id, clinica_id, data, hora_inicio, status, exige_pagamento_previo, liberado_sem_pagamento, exige_triagem, liberado_sem_triagem, pacientes(nome, nome_social), medicos(nome)')
      .eq('id', appointmentId).eq('clinica_id', clinicId).maybeSingle(),
    supabase.from('clinicas').select('exigir_pagamento_previo, exigir_triagem').eq('id', clinicId).maybeSingle(),
    supabase.from('fila_atendimento')
      .select('id, status, cobranca_estado')
      .eq('clinica_id', clinicId).eq('agendamento_id', appointmentId)
      .in('status', ACTIVE_QUEUE_STATUSES)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (appointmentResult.error) throw appointmentResult.error;
  if (clinicResult.error) throw clinicResult.error;
  if (queueResult.error) throw queueResult.error;
  if (!appointmentResult.data) return null;

  const appointment = appointmentResult.data as unknown as Appointment;
  const queue = queueResult.data as QueueEntry | null;
  const rules = clinicResult.data as ClinicRules | null;
  const alreadyReleased = type === 'pagamento' ? appointment.liberado_sem_pagamento : appointment.liberado_sem_triagem;
  if (alreadyReleased) return { appointment, queue, eligible: false, alreadyReleased: true, reason: 'Esta liberação já foi registrada.' };
  if (!rules) return { appointment, queue, eligible: false, alreadyReleased: false, reason: 'Não foi possível confirmar as regras desta clínica.' };
  if (!queue) return { appointment, queue: null, eligible: false, alreadyReleased: false, reason: 'Este atendimento não está mais na fila ativa.' };
  if (TERMINAL_APPOINTMENT_STATUSES.includes(String(appointment.status))) {
    return { appointment, queue, eligible: false, alreadyReleased: false, reason: 'O atendimento foi cancelado ou encerrado e não pode ser liberado.' };
  }

  if (type === 'pagamento') {
    if (queue.cobranca_estado === 'pendente') {
      return { appointment, queue, eligible: false, alreadyReleased: false, reason: 'A confirmação do check-in ainda está pendente. Aguarde a recepção.' };
    }
    if (!rules.exigir_pagamento_previo || !appointment.exige_pagamento_previo) {
      return { appointment, queue, eligible: false, alreadyReleased: false, reason: 'Este atendimento não está bloqueado pela regra de pagamento.' };
    }
    const { data, error } = await supabase.rpc('verificar_pagamento_fila', { p_agendamento_ids: [appointmentId] });
    if (error) throw error;
    const blocked = data?.some(result => result.agendamento_id === appointmentId && !result.pode_atender) ?? false;
    return blocked
      ? { appointment, queue, eligible: true, alreadyReleased: false, reason: '' }
      : { appointment, queue, eligible: false, alreadyReleased: false, reason: 'O pagamento já foi confirmado ou a regra não se aplica mais.' };
  }

  if (!rules.exigir_triagem || !appointment.exige_triagem) {
    return { appointment, queue, eligible: false, alreadyReleased: false, reason: 'Este atendimento não exige triagem.' };
  }
  const { data, error } = await supabase.rpc('listar_agendamentos_com_triagem', { p_agendamento_ids: [appointmentId] });
  if (error) throw error;
  const triageExists = data?.some(result => result.agendamento_id === appointmentId) ?? false;
  return triageExists
    ? { appointment, queue, eligible: false, alreadyReleased: false, reason: 'A triagem já foi registrada para este atendimento.' }
    : { appointment, queue, eligible: true, alreadyReleased: false, reason: '' };
}

function appointmentDate(date: string, time: string) {
  const parsed = new Date(`${date}T12:00:00`);
  const formattedDate = Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('pt-BR');
  return `${formattedDate} · ${time.slice(0, 5)}`;
}

export default function LiberarAtendimentoPage() {
  const { agendamentoId = '', tipo } = useParams();
  const type: ReleaseType | null = tipo === 'pagamento' || tipo === 'triagem' ? tipo : null;
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, hasAnyRole } = useSupabaseAuth();
  const clinicId = profile?.clinica_id ?? null;
  const routeState = location.state as RouteState | null;
  const returnTo = typeof routeState?.returnTo === 'string' && /^\/fila(?:\?.*)?$/.test(routeState.returnTo)
    ? routeState.returnTo : '/fila';
  const fallbackName = typeof routeState?.patientName === 'string' ? routeState.patientName : 'Paciente';
  const [justification, setJustification] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const completed = useRef(false);
  const submitLock = useRef(false);
  const canRelease = hasAnyRole([...PERFIS_LIBERACAO_EXCEPCIONAL]);

  const contextQuery = useQuery({
    queryKey: ['fila-liberacao-excepcional', clinicId, agendamentoId, type],
    enabled: Boolean(canRelease && clinicId && agendamentoId && type),
    queryFn: () => loadReleaseContext(clinicId!, agendamentoId, type!),
  });
  const context = contextQuery.data;
  const patientName = context ? getPatientName(context.appointment, fallbackName) : fallbackName;
  const title = type === 'pagamento' ? 'Liberar atendimento sem pagamento confirmado' : 'Liberar atendimento sem triagem';
  const minimumReasonMet = justification.trim().length >= 5;
  const returnToQueue = () => navigate(returnTo);

  const finishRelease = async (alreadySaved = false) => {
    completed.current = true;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['agendamentos'] }),
      queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] }),
      queryClient.invalidateQueries({ queryKey: ['fila-liberacao-pagamento', clinicId] }),
      queryClient.invalidateQueries({ queryKey: ['fila-triagens', clinicId] }),
    ]);
    if (alreadySaved) toast.info('A liberação já constava no atendimento. Nenhuma segunda alteração foi feita.');
    else toast.success('Liberação excepcional registrada', { description: 'Autor, data e justificativa ficam vinculados ao atendimento.' });
    navigate(returnTo, { replace: true });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current || !canRelease || !profile?.id || !clinicId || !type || !context?.eligible || !minimumReasonMet) return;
    submitLock.current = true;
    setSaving(true);
    setSubmitError('');
    let writeAttempted = false;
    try {
      const latest = await loadReleaseContext(clinicId, agendamentoId, type);
      if (!latest?.eligible) throw new Error(latest?.reason || 'Este atendimento não está mais disponível. Atualize a fila antes de continuar.');

      const reason = justification.trim();
      const releaseColumn = type === 'pagamento' ? 'liberado_sem_pagamento' : 'liberado_sem_triagem';
      const update = type === 'pagamento'
        ? supabase.from('agendamentos').update({
            liberado_sem_pagamento: true,
            liberado_sem_pagamento_por: profile!.id,
            liberado_sem_pagamento_em: new Date().toISOString(),
            motivo_liberacao: reason,
          })
        : supabase.from('agendamentos').update({
            liberado_sem_triagem: true,
            liberado_sem_triagem_por: profile!.id,
            liberado_sem_triagem_em: new Date().toISOString(),
            liberado_sem_triagem_motivo: reason,
          });
      writeAttempted = true;
      const { data, error } = await update
        .eq('id', agendamentoId).eq('clinica_id', clinicId).eq(releaseColumn, false)
        .select('id').maybeSingle();
      if (error) throw error;
      if (!data) {
        const refreshed = await contextQuery.refetch();
        if (refreshed.data?.alreadyReleased) {
          await finishRelease(true);
          return;
        }
        throw new Error('O atendimento mudou desde a última conferência. Atualize a fila antes de tentar novamente.');
      }
      await finishRelease();
    } catch (error) {
      if (writeAttempted) {
        try {
          const refreshed = await contextQuery.refetch();
          if (refreshed.data?.alreadyReleased) {
            await finishRelease(true);
            return;
          }
        } catch {
          // Mantém a justificativa para que o usuário confira e tente novamente.
        }
      }
      setSubmitError(mensagemDeErro(error));
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  };

  if (!type) return <ErrorState title="Tipo de liberação inválido" description="Volte à fila e abra a liberação pelo bloqueio correspondente." />;
  if (!canRelease) return <ErrorState title="Sem permissão para esta operação" description="A liberação excepcional é restrita a médicos e administradores." />;
  if (contextQuery.isLoading) return <main className="mx-auto w-full max-w-4xl space-y-6 pb-24 sm:pb-8"><Skeleton className="h-16 w-full" /><Skeleton className="h-44 w-full" /><Skeleton className="h-56 w-full" /></main>;
  if (contextQuery.isError) return <ErrorState title="Não foi possível conferir a liberação" description="A operação fica bloqueada até confirmar as regras da clínica e o estado atual da fila." error={contextQuery.error} onRetry={() => void contextQuery.refetch()} />;
  if (!context) return <ErrorState title="Atendimento não encontrado nesta clínica" description="Ele pode ter sido removido da fila ou pertencer a outra clínica." onRetry={returnToQueue} />;

  return <main className="mx-auto w-full max-w-4xl space-y-6 pb-24 sm:pb-8" data-testid="fila-exceptional-release-page">
    <UnsavedChangesGuard dirty={justification.trim().length > 0} busy={saving} completed={completed} />
    <PageHeader
      title="Liberação excepcional"
      description={title}
      icon={<ShieldAlert />}
      actions={<Button type="button" variant="outline" onClick={returnToQueue}><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar para a fila</Button>}
    />

    <Card>
      <CardHeader className="border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Atendimento em revisão</CardTitle>
            <p className="text-sm text-muted-foreground">Confira a pessoa e o bloqueio antes de registrar a exceção.</p>
          </div>
          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-foreground">Exige justificativa</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-4 sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">Paciente</p><p className="mt-1 font-medium">{patientName}</p></div>
        <div><p className="text-xs text-muted-foreground">Profissional</p><p className="mt-1 font-medium">{context.appointment.medicos?.nome || 'Não informado'}</p></div>
        <div><p className="text-xs text-muted-foreground">Agendamento</p><p className="mt-1 font-medium tabular-nums">{appointmentDate(context.appointment.data, context.appointment.hora_inicio)}</p></div>
      </CardContent>
    </Card>

    {!context.eligible ? (
      <Card className="border-warning/40">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold">A liberação não pode ser registrada</h2><p className="mt-1 text-sm text-muted-foreground">{context.reason}</p></div>
          <Button type="button" onClick={returnToQueue}>Voltar para a fila</Button>
        </CardContent>
      </Card>
    ) : <>
      <div role="note" className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
        <p>{type === 'pagamento'
          ? 'Esta exceção permite seguir com o atendimento mesmo com saldo em aberto. Ela não registra pagamento, quita a cobrança nem altera valores financeiros.'
          : 'Esta exceção permite seguir com o atendimento sem o registro de triagem. Ela não cria sinais vitais nem substitui uma avaliação clínica.'}</p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Justificativa da exceção</CardTitle><p className="text-sm text-muted-foreground">A decisão fica registrada junto ao autor e ao horário pelo sistema.</p></CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="fila-release-reason">Motivo (mínimo 5 caracteres)</Label>
            <Textarea
              id="fila-release-reason"
              value={justification}
              onChange={event => { setJustification(event.target.value); setSubmitError(''); }}
              placeholder={type === 'pagamento' ? 'Explique por que o atendimento deve seguir antes da confirmação do pagamento.' : 'Explique por que o atendimento deve seguir sem triagem registrada.'}
              rows={5}
              maxLength={1000}
              required
              aria-describedby={submitError ? 'fila-release-error fila-release-count' : 'fila-release-count'}
              disabled={saving}
            />
            <p id="fila-release-count" className="text-right text-xs text-muted-foreground">{justification.trim().length}/1000 caracteres</p>
            {submitError && <p id="fila-release-error" role="alert" className="text-sm text-destructive">{submitError}</p>}
            {justification.trim().length > 0 && !minimumReasonMet && <p className="text-sm text-destructive">Informe ao menos 5 caracteres.</p>}
          </CardContent>
        </Card>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={saving} onClick={returnToQueue}>Cancelar</Button>
          <Button type="submit" disabled={saving || !minimumReasonMet}>
            {saving && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
            Registrar liberação
          </Button>
        </div>
      </form>
    </>}
  </main>;
}
