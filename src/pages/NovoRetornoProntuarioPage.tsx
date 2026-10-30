import { type FormEvent, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, addMonths, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, CalendarCheck, Loader2, UserRound, Stethoscope } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { autorizarLeituraHistoricoPaciente, registrarAcessoProntuario } from '@/lib/prontuarioAudit';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';
import { toast } from 'sonner';

type Related<T> = T | T[] | null;
type ReturnContext = {
  prontuarioId: string | null;
  pacienteId: string;
  medicoId: string;
  dataProntuario: string | null;
  assinado: boolean;
  paciente: { nome: string | null; nome_social: string | null } | null;
  medico: { nome: string | null; crm: string | null } | null;
};

function one<T>(value: Related<T> | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

const returnPresets = [
  { label: '7 dias', calculate: () => addDays(parseDateOnly(todaySaoPauloDateOnly())!, 7) },
  { label: '15 dias', calculate: () => addDays(parseDateOnly(todaySaoPauloDateOnly())!, 15) },
  { label: '30 dias', calculate: () => addDays(parseDateOnly(todaySaoPauloDateOnly())!, 30) },
  { label: '2 meses', calculate: () => addMonths(parseDateOnly(todaySaoPauloDateOnly())!, 2) },
  { label: '3 meses', calculate: () => addMonths(parseDateOnly(todaySaoPauloDateOnly())!, 3) },
  { label: '6 meses', calculate: () => addMonths(parseDateOnly(todaySaoPauloDateOnly())!, 6) },
];

const returnTypes = [
  { value: 'acompanhamento', label: 'Acompanhamento' },
  { value: 'resultado_exame', label: 'Resultado de exame' },
  { value: 'avaliacao_tratamento', label: 'Avaliação de tratamento' },
  { value: 'controle', label: 'Controle' },
  { value: 'outro', label: 'Outro' },
];

export default function NovoRetornoProntuarioPage() {
  const { prontuarioId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const pacienteIdParam = searchParams.get('paciente') || '';
  const medicoIdParam = searchParams.get('medico') || '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const { medicoId: currentMedicoId, isMedicoOnly, isLoading: medicoLoading, error: medicoError } = useCurrentMedico();
  const clinicId = profile?.clinica_id;
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customDate, setCustomDate] = useState('');
  const [returnType, setReturnType] = useState('acompanhamento');
  const [reason, setReason] = useState('');
  const [observations, setObservations] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitLock = useRef(false);
  const completed = useRef(false);

  const contextQuery = useQuery({
    queryKey: ['novo-retorno-prontuario', clinicId, prontuarioId, pacienteIdParam, medicoIdParam, isMedicoOnly, currentMedicoId],
    enabled: Boolean(clinicId && (prontuarioId || pacienteIdParam) && (!isMedicoOnly || !medicoLoading)),
    queryFn: async (): Promise<ReturnContext> => {
      if (!clinicId) throw new Error('Clínica ativa não encontrada. Atualize a sessão e tente novamente.');
      if (isMedicoOnly && medicoError) throw medicoError;
      if (isMedicoOnly && !currentMedicoId) throw new Error('O profissional vinculado à sua conta não está disponível.');

      if (prontuarioId) {
        await registrarAcessoProntuario(prontuarioId, 'visualizacao');
        let query = supabase
          .from('prontuarios')
          .select('id,paciente_id,medico_id,data,assinado,pacientes(nome,nome_social),medicos(nome,crm)')
          .eq('id', prontuarioId)
          .eq('clinica_id', clinicId);
        if (isMedicoOnly && currentMedicoId) query = query.eq('medico_id', currentMedicoId);
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Este prontuário não está disponível para a clínica ativa ou para o seu perfil.');
        const assignedDoctorId = medicoIdParam || (isMedicoOnly ? currentMedicoId : data.medico_id);
        if (!assignedDoctorId || (isMedicoOnly && assignedDoctorId !== currentMedicoId)) {
          throw new Error('O profissional responsável pelo retorno não está autorizado para este prontuário.');
        }
        const { data: doctor, error: doctorError } = await supabase
          .from('medicos')
          .select('id,nome,crm')
          .eq('id', assignedDoctorId)
          .eq('clinica_id', clinicId)
          .maybeSingle();
        if (doctorError) throw doctorError;
        if (!doctor) throw new Error('O profissional responsável não está disponível para a clínica ativa.');
        return {
          prontuarioId: data.id,
          pacienteId: data.paciente_id,
          medicoId: doctor.id,
          dataProntuario: data.data,
          assinado: Boolean(data.assinado),
          paciente: one(data.pacientes),
          medico: doctor,
        };
      }

      await autorizarLeituraHistoricoPaciente(pacienteIdParam);
      const patientQuery = supabase.from('pacientes').select('id,nome,nome_social').eq('id', pacienteIdParam).eq('clinica_id', clinicId);
      const { data: patient, error: patientError } = await patientQuery.maybeSingle();
      if (patientError) throw patientError;
      if (!patient) throw new Error('Este paciente não está disponível para a clínica ativa.');

      const selectedDoctorId = isMedicoOnly ? currentMedicoId : medicoIdParam || currentMedicoId;
      if (!selectedDoctorId) throw new Error('Selecione um profissional responsável para agendar o retorno.');
      const { data: doctor, error: doctorError } = await supabase
        .from('medicos')
        .select('id,nome,crm')
        .eq('id', selectedDoctorId)
        .eq('clinica_id', clinicId)
        .maybeSingle();
      if (doctorError) throw doctorError;
      if (!doctor) throw new Error('O profissional responsável não está disponível para a clínica ativa.');

      return {
        prontuarioId: null,
        pacienteId: patient.id,
        medicoId: doctor.id,
        dataProntuario: null,
        assinado: false,
        paciente: patient,
        medico: doctor,
      };
    },
  });

  const context = contextQuery.data;
  const patientName = context?.paciente?.nome_social || context?.paciente?.nome || 'Paciente';
  const doctorName = context?.medico?.nome || 'Profissional responsável';
  const returnTo = useMemo(() => {
    if (!context) return '/prontuarios';
    if (context.prontuarioId && context.assinado) {
      return `/prontuarios?paciente=${encodeURIComponent(context.pacienteId)}&prontuario=${encodeURIComponent(context.prontuarioId)}&secao=conduta`;
    }
    return `/prontuarios?paciente=${encodeURIComponent(context.pacienteId)}`;
  }, [context]);
  const loading = contextQuery.isLoading || (isMedicoOnly && medicoLoading);
  const pageError = (isMedicoOnly && medicoError) || contextQuery.error;
  const selectedDate = selectedPreset !== null
    ? format(returnPresets[selectedPreset].calculate(), 'yyyy-MM-dd')
    : customDate;
  const dirty = Boolean(selectedPreset !== null || customDate || returnType !== 'acompanhamento' || reason.trim() || observations.trim());
  const dateInvalid = attempted && !selectedDate;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    setSaveError(null);
    if (submitLock.current || !context || !selectedDate || saving) return;

    const date = selectedPreset !== null
      ? returnPresets[selectedPreset].calculate()
      : parseISO(customDate);
    const dateOnly = date ? format(date, 'yyyy-MM-dd') : '';
    if (!dateOnly || dateOnly < todaySaoPauloDateOnly()) {
      setSaveError('Escolha uma data de retorno a partir de hoje.');
      return;
    }

    submitLock.current = true;
    setSaving(true);
    try {
      const { error } = await supabase.from('retornos').insert({
        paciente_id: context.pacienteId,
        prontuario_id: context.prontuarioId,
        medico_id: context.medicoId,
        data_retorno_prevista: dateOnly,
        tipo_retorno: returnType,
        motivo: reason.trim() || null,
        observacoes: observations.trim() || null,
        clinica_id: clinicId,
      });
      if (error) throw error;

      completed.current = true;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['patient-returns', clinicId, context.pacienteId] }),
        queryClient.invalidateQueries({ queryKey: ['retornos'] }),
      ]);
      toast.success('Retorno registrado', { description: `Próximo acompanhamento de ${patientName} salvo.` });
      navigate(returnTo, { replace: true });
    } catch (error) {
      const message = mensagemDeErro(error);
      setSaveError(`Não foi possível registrar o retorno. ${message} Os campos foram mantidos.`);
      toast.error('Não foi possível registrar o retorno', { description: message });
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-24 sm:pb-8">
      <UnsavedChangesGuard dirty={dirty} busy={saving} completed={completed} />
      <PageHeader
        title="Agendar retorno clínico"
        description="Registre o próximo acompanhamento e mantenha o vínculo com o paciente e a evolução de origem."
        icon={<CalendarCheck />}
        actions={context && (
          <Button type="button" variant="outline" onClick={() => navigate(returnTo)}>
            <ArrowLeft className="mr-2 h-4 w-4" />{context.prontuarioId ? 'Voltar ao prontuário' : 'Voltar aos prontuários'}
          </Button>
        )}
      />

      {loading ? (
        <div role="status" className="flex min-h-32 items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />Verificando paciente e prontuário…
        </div>
      ) : pageError || !context ? (
        <section role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <h2 className="font-semibold text-foreground">Não foi possível abrir este retorno</h2>
          <p className="mt-1 text-sm text-muted-foreground">{pageError instanceof Error ? pageError.message : 'Confirme o acesso clínico e tente novamente.'}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {contextQuery.isError && <Button type="button" variant="outline" onClick={() => void contextQuery.refetch()}>Tentar novamente</Button>}
            <Button type="button" variant="outline" onClick={() => navigate('/prontuarios')}>Voltar aos prontuários</Button>
          </div>
        </section>
      ) : (
        <>
          <section aria-label="Contexto clínico" className="grid gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:grid-cols-3 sm:divide-x sm:divide-border sm:px-5">
            <div className="flex min-w-0 items-center gap-3 sm:pr-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="h-4 w-4" /></span>
              <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">Paciente</p><p className="truncate text-sm font-semibold text-foreground">{patientName}</p></div>
            </div>
            <div className="flex min-w-0 items-center gap-3 sm:px-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Stethoscope className="h-4 w-4" /></span>
              <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">Profissional responsável</p><p className="truncate text-sm font-semibold text-foreground">{doctorName}</p></div>
            </div>
            <div className="min-w-0 sm:pl-4"><p className="text-xs font-medium text-muted-foreground">Origem</p><p className="truncate text-sm font-semibold text-foreground">{context.prontuarioId && context.dataProntuario ? `Evolução de ${format(parseDateOnly(context.dataProntuario)!, 'dd/MM/yyyy', { locale: ptBR })}` : 'Solicitação clínica'}</p></div>
          </section>

          <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-4 sm:p-6" noValidate>
            <div className="max-w-3xl space-y-6">
              <fieldset>
                <legend className="text-sm font-semibold text-foreground">Quando será o retorno?</legend>
                <div className="mt-3 flex flex-wrap gap-2" aria-label="Prazos sugeridos">
                  {returnPresets.map((preset, index) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant={selectedPreset === index ? 'default' : 'outline'}
                      aria-pressed={selectedPreset === index}
                      onClick={() => { setSelectedPreset(index); setCustomDate(''); setSaveError(null); }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <div className="mt-4 max-w-sm space-y-2">
                  <Label htmlFor="retorno-data-especifica">Ou escolha uma data específica</Label>
                  <Input
                    id="retorno-data-especifica"
                    aria-label="Data específica do retorno"
                    type="date"
                    min={todaySaoPauloDateOnly()}
                    value={customDate}
                    aria-invalid={dateInvalid}
                    onChange={event => { setCustomDate(event.target.value); setSelectedPreset(null); setSaveError(null); }}
                  />
                  {dateInvalid && <p className="text-sm text-destructive">Escolha uma data de retorno.</p>}
                </div>
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="retorno-tipo">Tipo de retorno</Label>
                  <Select value={returnType} onValueChange={setReturnType}>
                    <SelectTrigger id="retorno-tipo" aria-label="Tipo de retorno"><SelectValue /></SelectTrigger>
                    <SelectContent>{returnTypes.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retorno-motivo">Motivo <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                  <Input id="retorno-motivo" aria-label="Motivo do retorno" value={reason} onChange={event => setReason(event.target.value)} placeholder="Ex.: reavaliar resposta ao tratamento" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="retorno-observacoes">Observações <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Textarea id="retorno-observacoes" aria-label="Observações" value={observations} onChange={event => setObservations(event.target.value)} placeholder="Orientações para a continuidade do cuidado" rows={3} />
              </div>
            </div>

            {saveError && <p role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{saveError}</p>}
            <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-6 flex flex-col-reverse gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:flex-row sm:justify-end lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => navigate(returnTo)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando retorno…</> : 'Agendar retorno'}
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
