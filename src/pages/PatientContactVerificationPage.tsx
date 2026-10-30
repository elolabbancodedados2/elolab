import { type FormEvent, useRef, useState } from 'react';
import { ArrowLeft, BadgeCheck, Loader2, Mail, Phone } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';
import {
  contactConfirmationSourceLabel,
  describeContactVerification,
  recordPatientContactVerification,
  type ContactConfirmationSource,
  type PatientContactChannel,
} from '@/lib/patientContactVerification';
import { toast } from 'sonner';

interface PatientContactContext {
  id: string;
  nome: string;
  nome_social: string | null;
  telefone: string | null;
  email: string | null;
  telefone_confirmado_em: string | null;
  telefone_confirmacao_origem: string | null;
  email_confirmado_em: string | null;
  email_confirmacao_origem: string | null;
}

interface ContactReturnState {
  returnTo?: unknown;
  returnState?: unknown;
  returnScrollTop?: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function contactVerificationErrorMessage(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? '');
  if (message.includes('Cadastre o telefone antes de confirmar')) {
    return 'O telefone deixou de estar disponível. Atualize a ficha antes de confirmar.';
  }
  if (message.includes('Cadastre o e-mail antes de confirmar')) {
    return 'O e-mail deixou de estar disponível. Atualize a ficha antes de confirmar.';
  }
  if (message.includes('Canal ou origem de confirmação inválidos')) {
    return 'A confirmação foi recusada. Revise o canal e a origem escolhida; nenhum dado foi alterado.';
  }
  if (message.includes('Sem permissão para confirmar os contatos')) {
    return 'Seu perfil não pode confirmar dados de contato. Peça ajuda a um administrador da clínica.';
  }
  if (message.includes('Paciente não encontrado nesta clínica')) {
    return 'Esta ficha não está disponível na clínica ativa. Volte à lista e confira o paciente.';
  }
  return mensagemDeErro(error);
}

function safePatientReturnTo(value: unknown, patientId: string) {
  if (typeof value !== 'string' || !value.startsWith('/pacientes') || value.includes('#')) return '';
  const [pathname, query = ''] = value.split('?');
  if (pathname === `/pacientes/${patientId}`) return value;
  if (pathname === '/pacientes' && new URLSearchParams(query).get('paciente') === patientId) return value;
  return '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export default function PatientContactVerificationPage() {
  const { patientId = '', channel: channelParam = '' } = useParams();
  const channel: PatientContactChannel | null = channelParam === 'telefone' || channelParam === 'email' ? channelParam : null;
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, isLoading: authLoading } = useSupabaseAuth();
  const routeState = location.state as ContactReturnState | null;
  const returnTo = safePatientReturnTo(routeState?.returnTo, patientId) || `/pacientes/${encodeURIComponent(patientId)}`;
  const inheritedState = isObject(routeState?.returnState) ? routeState.returnState : null;
  const returnScrollTop = typeof routeState?.returnScrollTop === 'number' ? Math.max(0, routeState.returnScrollTop) : null;
  const [source, setSource] = useState<ContactConfirmationSource>('paciente');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const submissionLock = useRef(false);
  const completed = useRef(false);

  const patientQuery = useQuery({
    queryKey: ['patient-contact-verification', profile?.clinica_id ?? null, patientId],
    enabled: Boolean(profile?.clinica_id && patientId && channel),
    queryFn: async (): Promise<PatientContactContext | null> => {
      if (!profile?.clinica_id || !patientId) throw new Error('Clínica ou paciente não identificado.');
      const { data, error } = await supabase
        .from('pacientes')
        .select('id, nome, nome_social, telefone, email, telefone_confirmado_em, telefone_confirmacao_origem, email_confirmado_em, email_confirmacao_origem')
        .eq('clinica_id', profile.clinica_id)
        .eq('id', patientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const patient = patientQuery.data;
  const contactValue = channel === 'telefone' ? patient?.telefone : patient?.email;
  const confirmedAt = channel === 'telefone' ? patient?.telefone_confirmado_em : patient?.email_confirmado_em;
  const confirmedSource = channel === 'telefone' ? patient?.telefone_confirmacao_origem : patient?.email_confirmacao_origem;
  const channelLabel = channel === 'telefone' ? 'telefone' : 'e-mail';
  const returnToPatient = () => navigate(returnTo, {
    replace: true,
    state: {
      ...(inheritedState ?? {}),
      ...(returnScrollTop !== null ? { returnScrollTop } : {}),
    },
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!patient || !channel || !contactValue?.trim() || saving || submissionLock.current) return;
    submissionLock.current = true;
    setSaving(true);
    setSaveError('');
    try {
      await recordPatientContactVerification(patient.id, channel, source);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['paciente-lista-selecionado', profile?.clinica_id, patient.id] }),
        queryClient.invalidateQueries({ queryKey: ['pacientes-lista-detalhes', profile?.clinica_id] }),
        queryClient.invalidateQueries({ queryKey: ['paciente-deep-link', profile?.clinica_id, patient.id] }),
        queryClient.invalidateQueries({ queryKey: ['patient-contact-verification', profile?.clinica_id, patient.id] }),
      ]);
      completed.current = true;
      toast.success(`${channel === 'telefone' ? 'Telefone' : 'E-mail'} confirmado.`);
      returnToPatient();
    } catch (error) {
      setSaveError(contactVerificationErrorMessage(error));
    } finally {
      submissionLock.current = false;
      setSaving(false);
    }
  };

  if (!UUID.test(patientId) || !channel) {
    return (
      <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        <PageHeader title="Confirmar contato" icon={<BadgeCheck />} />
        <Alert variant="destructive"><AlertTitle>Endereço de confirmação inválido</AlertTitle><AlertDescription>Volte à ficha do paciente e escolha o canal que deseja confirmar.</AlertDescription></Alert>
        <Button type="button" variant="outline" onClick={returnToPatient}><ArrowLeft className="mr-2 h-4 w-4" />Voltar à ficha</Button>
      </main>
    );
  }

  if (authLoading || patientQuery.isLoading) {
    return <main className="mx-auto flex min-h-48 w-full max-w-4xl items-center justify-center gap-3 px-4 text-sm text-muted-foreground sm:px-6" aria-busy="true" role="status"><Loader2 className="h-5 w-5 animate-spin" />Carregando a ficha do paciente…</main>;
  }

  if (patientQuery.isError) {
    return (
      <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        <PageHeader title={`Confirmar ${channelLabel}`} icon={channel === 'telefone' ? <Phone /> : <Mail />} actions={<Button type="button" variant="outline" onClick={returnToPatient}><ArrowLeft className="mr-2 h-4 w-4" />Voltar à ficha</Button>} />
        <ErrorState title="Não foi possível carregar o contato" error={patientQuery.error} onRetry={() => void patientQuery.refetch()} />
      </main>
    );
  }

  if (!patient) {
    return (
      <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        <PageHeader title={`Confirmar ${channelLabel}`} icon={channel === 'telefone' ? <Phone /> : <Mail />} actions={<Button type="button" variant="outline" onClick={returnToPatient}><ArrowLeft className="mr-2 h-4 w-4" />Voltar à ficha</Button>} />
        <Alert variant="destructive"><AlertTitle>Paciente indisponível</AlertTitle><AlertDescription>Esta ficha não pertence à clínica ativa ou não está mais disponível.</AlertDescription></Alert>
      </main>
    );
  }

  const displayName = patient.nome_social || patient.nome;
  const canSubmit = Boolean(contactValue?.trim()) && !saving;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 pb-24 sm:px-6 md:pb-6">
      <PageHeader
        title={`Confirmar ${channelLabel}`}
        description="Registre quando e com quem a equipe confirmou este dado de contato."
        icon={channel === 'telefone' ? <Phone /> : <Mail />}
        actions={<Button type="button" variant="outline" onClick={returnToPatient} disabled={saving} className="gap-2 rounded-full"><ArrowLeft className="h-4 w-4" />Voltar à ficha</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.75fr)]">
        <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Ficha do paciente</p>
            <CardTitle className="text-xl">{displayName}</CardTitle>
            <CardDescription>{channel === 'telefone' ? 'Telefone cadastrado' : 'E-mail cadastrado'}: <strong className="font-medium text-foreground">{contactValue || 'Não informado'}</strong></CardDescription>
          </CardHeader>
          <CardContent>
            {!contactValue?.trim() ? (
              <Alert variant="destructive"><AlertTitle>Contato não cadastrado</AlertTitle><AlertDescription>Cadastre o {channelLabel} antes de registrar a confirmação. A ficha continua inalterada.</AlertDescription></Alert>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="contact-confirm-source">Confirmado com *</Label>
                  <Select value={source} onValueChange={(value) => { setSource(value as ContactConfirmationSource); setSaveError(''); }}>
                    <SelectTrigger id="contact-confirm-source" aria-describedby="contact-confirm-help"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paciente">Paciente</SelectItem>
                      <SelectItem value="responsavel">Responsável</SelectItem>
                      <SelectItem value="equipe">Equipe consultou o cadastro</SelectItem>
                    </SelectContent>
                  </Select>
                  <p id="contact-confirm-help" className="text-sm text-muted-foreground">A origem e o horário ficam registrados no histórico administrativo da ficha.</p>
                </div>

                {saveError && <Alert variant="destructive"><AlertTitle>Não foi possível confirmar o contato</AlertTitle><AlertDescription>{saveError}</AlertDescription></Alert>}

                <div className="flex flex-col justify-end gap-2 border-t border-border pt-4 sm:flex-row">
                  <Button type="button" variant="outline" onClick={returnToPatient} disabled={saving}>Cancelar</Button>
                  <Button type="submit" disabled={!canSubmit} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BadgeCheck className="h-4 w-4" aria-hidden="true" />}
                    {saving ? 'Salvando…' : 'Registrar confirmação'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <aside aria-labelledby="contact-confirm-context" className="space-y-4 lg:border-l lg:border-border lg:pl-6">
          <div>
            <h2 id="contact-confirm-context" className="text-base font-semibold">Confirmação atual</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{describeContactVerification(confirmedAt, confirmedSource)}</p>
          </div>
          <div className="flex gap-3 border-t border-border pt-4">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><BadgeCheck className="h-4 w-4" /></span>
            <p className="text-sm leading-5">Se o {channelLabel} for alterado depois, a confirmação será removida automaticamente pelo sistema.</p>
          </div>
          {confirmedAt && <p className="text-sm text-muted-foreground">Origem registrada: {contactConfirmationSourceLabel(confirmedSource)}</p>}
        </aside>
      </div>

      <UnsavedChangesGuard dirty={source !== 'paciente'} busy={saving} completed={completed} />
    </main>
  );
}
