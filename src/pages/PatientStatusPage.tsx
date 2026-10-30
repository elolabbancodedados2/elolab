import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Power } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { ErrorState } from '@/components/ErrorState';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';
import { PATIENT_STATUS_REASON_LABELS, PATIENT_STATUS_REASONS, isValidPatientStatusReason, setPatientActiveStatus, type PatientStatusReason } from '@/lib/patientStatus';
import { toast } from 'sonner';

interface PatientStatusContext {
  id: string;
  nome: string;
  ativo: boolean;
}

interface ReturnState {
  returnTo?: unknown;
  patientFilters?: Record<string, unknown>;
}

function statusChangeErrorMessage(error: unknown) {
  const message = String((error as { message?: string } | null)?.message ?? error ?? '');
  if (message.includes('Cancele ou conclua os agendamentos atuais e futuros')) {
    return 'Antes de inativar, cancele ou conclua os agendamentos atuais e futuros. O paciente permanece ativo.';
  }
  if (message.includes('Remova o paciente da fila de atendimento')) {
    return 'Retire o paciente da fila de atendimento e tente novamente. O status não foi alterado.';
  }
  return mensagemDeErro(error);
}

function safeReturnTo(value: unknown, patientId: string) {
  if (typeof value === 'string' && /^\/pacientes(?:\?[^#]*)?$/.test(value)) return value;
  return `/pacientes/${encodeURIComponent(patientId)}`;
}

export default function PatientStatusPage() {
  const { patientId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, isLoading: authLoading } = useSupabaseAuth();
  const pageRef = useRef<HTMLElement>(null);
  const completed = useRef(false);
  const returnState = location.state as ReturnState | null;
  const returnTo = safeReturnTo(returnState?.returnTo, patientId);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const patientQuery = useQuery({
    queryKey: ['patient-status-context', profile?.clinica_id ?? null, patientId],
    enabled: Boolean(profile?.clinica_id && patientId),
    queryFn: async (): Promise<PatientStatusContext | null> => {
      if (!profile?.clinica_id || !patientId) throw new Error('Clínica ou paciente não identificado.');
      const { data, error } = await supabase
        .from('pacientes')
        .select('id, nome, ativo')
        .eq('clinica_id', profile.clinica_id)
        .eq('id', patientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    pageRef.current?.focus({ preventScroll: true });
  }, []);

  const patient = patientQuery.data;
  const isActive = patient?.ativo !== false;
  const actionLabel = isActive ? 'Inativar paciente' : 'Reativar paciente';
  const returnToList = (focusId?: string) => navigate(returnTo, {
    replace: true,
    state: {
      ...(returnState?.patientFilters ? { patientFilters: returnState.patientFilters } : {}),
      ...(focusId ? { focusId } : {}),
    },
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!patient || !isValidPatientStatusReason(reason) || saving) return;

    setSaveError('');
    setSaving(true);
    try {
      const result = await setPatientActiveStatus(patient.id, !isActive, reason as PatientStatusReason);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['busca-pacientes'] }),
        queryClient.invalidateQueries({ queryKey: ['pacientes-lista-detalhes'] }),
      ]);
      completed.current = true;
      if (result.alterado) {
        toast.success(result.ativo ? 'Paciente reativado.' : 'Paciente inativado.', {
          description: result.ativo
            ? 'A ficha pode voltar a receber agendamentos. Links de portal revogados precisam ser gerados novamente.'
            : 'A ficha e o histórico foram preservados; novos agendamentos e links ativos do portal foram bloqueados.',
        });
      } else {
        toast.info('O paciente já estava nesse status. A lista foi atualizada.');
      }
      returnToList('patient-list-region');
    } catch (error) {
      setSaveError(statusChangeErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || patientQuery.isLoading) {
    return <main ref={pageRef} tabIndex={-1} className="mx-auto w-full max-w-5xl outline-none" aria-busy="true">
      <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-5 w-5 animate-spin" />Carregando a ficha do paciente…
      </div>
    </main>;
  }

  if (patientQuery.isError) {
    return <main ref={pageRef} tabIndex={-1} className="mx-auto w-full max-w-5xl space-y-5 outline-none">
      <PageHeader title="Alterar status do paciente" icon={<Power />} actions={<Button type="button" variant="outline" onClick={() => returnToList()}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>} />
      <ErrorState title="Não foi possível carregar o paciente" error={patientQuery.error} onRetry={() => void patientQuery.refetch()} />
    </main>;
  }

  if (!patient) {
    return <main ref={pageRef} tabIndex={-1} className="mx-auto w-full max-w-5xl space-y-5 outline-none">
      <PageHeader title="Paciente indisponível" icon={<Power />} actions={<Button asChild variant="outline"><Link to={returnTo} state={returnState?.patientFilters}><ArrowLeft className="mr-2 h-4 w-4" />Voltar à lista</Link></Button>} />
      <p role="status" className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Este paciente não está disponível para a clínica atual. Volte à lista e confira o contexto.</p>
    </main>;
  }

  return (
    <main ref={pageRef} tabIndex={-1} className="mx-auto w-full max-w-5xl space-y-6 pb-24 outline-none md:pb-6">
      <PageHeader
        title={actionLabel}
        description="Revise o status atual, o motivo e as consequências antes de confirmar."
        icon={<Power />}
        actions={<Button type="button" variant="outline" onClick={() => returnToList()} disabled={saving} className="gap-2 rounded-full"><ArrowLeft className="h-4 w-4" />Voltar à lista</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Cadastro do paciente</p>
            <CardTitle className="text-xl">{patient.nome}</CardTitle>
            <CardDescription>Status atual: <strong className="font-medium text-foreground">{isActive ? 'Ativo' : 'Inativo'}</strong></CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="patient-status-reason">Motivo administrativo *</Label>
                <Select value={reason} onValueChange={(value) => { setReason(value); setSaveError(''); }}>
                  <SelectTrigger id="patient-status-reason" aria-describedby="patient-status-reason-help">
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {PATIENT_STATUS_REASONS.map((item) => (
                      <SelectItem key={item} value={item}>{PATIENT_STATUS_REASON_LABELS[item]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p id="patient-status-reason-help" className="text-sm text-muted-foreground">O motivo fica registrado no histórico administrativo da ficha.</p>
              </div>

              {saveError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Não foi possível alterar o status</AlertTitle><AlertDescription>{saveError}</AlertDescription></Alert>}

              <div className="flex justify-end border-t border-border pt-4">
                <Button type="submit" disabled={!isValidPatientStatusReason(reason) || saving} variant={isActive ? 'destructive' : 'default'} className="w-full gap-2 rounded-full sm:w-auto">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Power className="h-4 w-4" aria-hidden="true" />}
                  {saving ? 'Salvando status…' : actionLabel}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <aside aria-labelledby="patient-status-impact" className="space-y-4 lg:border-l lg:border-border lg:pl-6">
          <div>
            <h2 id="patient-status-impact" className="text-base font-semibold">O que muda</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">A ficha, o histórico clínico e o financeiro permanecem preservados.</p>
          </div>
          {isActive ? (
            <>
              <div className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="h-4 w-4" /></span><p className="text-sm leading-5">Novos agendamentos ficam bloqueados e os links ativos do portal são revogados.</p></div>
              <div className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"><CheckCircle2 className="h-4 w-4" /></span><p className="text-sm leading-5">Antes de confirmar, cancele ou conclua compromissos atuais e futuros e retire o paciente de uma fila em andamento.</p></div>
              <p className="border-t border-border pt-4 text-sm text-muted-foreground">O servidor verifica novamente os compromissos e a fila durante a confirmação.</p>
            </>
          ) : (
            <>
              <div className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><CheckCircle2 className="h-4 w-4" /></span><p className="text-sm leading-5">A ficha poderá voltar a receber novos agendamentos.</p></div>
              <p className="border-t border-border pt-4 text-sm text-muted-foreground">Links de portal revogados não são restaurados. Gere um novo link somente depois de confirmar a identidade do paciente.</p>
            </>
          )}
        </aside>
      </div>

      <UnsavedChangesGuard dirty={Boolean(reason)} busy={saving} completed={completed} />
    </main>
  );
}
