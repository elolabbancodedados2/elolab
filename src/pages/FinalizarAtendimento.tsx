import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, CalendarCheck2, CalendarDays, Check, Clock3, Loader2, Stethoscope, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { autoFinalizarAtendimento } from '@/lib/workflowAutomation';
import { parseDateOnly, todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { toast } from 'sonner';

type PatientSummary = {
  nome: string | null;
  nome_social?: string | null;
  convenio_id?: string | null;
};

type AppointmentContext = {
  id: string;
  clinica_id: string;
  data: string | null;
  hora_inicio: string | null;
  hora_fim?: string | null;
  tipo: string | null;
  observacoes?: string | null;
  paciente_id: string;
  medico_id: string | null;
  status: string;
  pacientes: PatientSummary | PatientSummary[] | null;
  medicos: { nome: string | null } | { nome: string | null }[] | null;
};

const RETORNO_OPCOES = [7, 15, 30, 60, 90, 180] as const;
const ROTAS_DE_RETORNO = ['/fila', '/recepcao', '/agenda'];

function relacaoUnica<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function rotaPermitida(value: unknown): value is string {
  return typeof value === 'string' && ROTAS_DE_RETORNO.some((route) =>
    value === route || value.startsWith(`${route}?`),
  );
}

export default function FinalizarAtendimento() {
  const { agendamentoId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id;
  const filaIdInformado = searchParams.get('filaId');
  const origem = searchParams.get('origem') ?? 'fila';
  const [retornoSelecionado, setRetornoSelecionado] = useState('');
  const [salvando, setSalvando] = useState(false);
  const submitLock = useRef(false);
  const paginaConcluida = useRef(false);
  const navigationState = location.state as { returnTo?: unknown } | null;
  const returnTo = rotaPermitida(navigationState?.returnTo)
    ? navigationState.returnTo
    : origem === 'agenda'
      ? '/agenda'
      : origem === 'atendimentos-abertos'
        ? '/recepcao'
        : origem === 'recepcao'
          ? '/recepcao'
          : '/fila';

  useEffect(() => {
    setRetornoSelecionado('');
    paginaConcluida.current = false;
  }, [agendamentoId]);

  const appointmentQuery = useQuery({
    queryKey: ['atendimento-finalizacao', clinicaId, agendamentoId],
    enabled: Boolean(clinicaId && agendamentoId),
    queryFn: async (): Promise<AppointmentContext | null> => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select('id, clinica_id, data, hora_inicio, hora_fim, tipo, observacoes, paciente_id, medico_id, status, pacientes(nome, nome_social, convenio_id), medicos(nome)')
        .eq('id', agendamentoId)
        .eq('clinica_id', clinicaId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as AppointmentContext | null;
    },
  });

  const queueQuery = useQuery({
    queryKey: ['atendimento-finalizacao-fila', clinicaId, agendamentoId, filaIdInformado],
    enabled: Boolean(clinicaId && agendamentoId),
    queryFn: async () => {
      let query = supabase
        .from('fila_atendimento')
        .select('id, agendamento_id, clinica_id, status, created_at')
        .eq('clinica_id', clinicaId!)
        .eq('agendamento_id', agendamentoId)
        .neq('status', 'finalizado')
        .order('created_at', { ascending: false })
        .limit(1);
      if (filaIdInformado) query = query.eq('id', filaIdInformado);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (filaIdInformado && !data) {
        throw new Error('Este atendimento não está mais nesta fila. Volte e atualize a lista antes de continuar.');
      }
      return data;
    },
  });

  const appointment = appointmentQuery.data;
  const patient = relacaoUnica(appointment?.pacientes);
  const doctor = relacaoUnica(appointment?.medicos);
  const nomePaciente = patient?.nome_social || patient?.nome || 'Paciente';
  const retornoEm = useMemo(() => {
    const dias = Number(retornoSelecionado);
    if (!Number.isInteger(dias) || dias <= 0) return null;
    const hoje = parseDateOnly(todaySaoPauloDateOnly());
    return hoje ? format(addDays(hoje, dias), 'dd/MM/yyyy', { locale: ptBR }) : null;
  }, [retornoSelecionado]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current || !appointment || !clinicaId || !retornoSelecionado) return;
    if (appointment.status !== 'em_atendimento') {
      toast.error('Este atendimento mudou de estado', { description: 'Atualize a fila e confira o registro antes de tentar novamente.' });
      return;
    }
    submitLock.current = true;
    setSalvando(true);
    try {
      const dias = retornoSelecionado === 'sem-retorno' ? null : Number(retornoSelecionado);
      const result = await autoFinalizarAtendimento({
        agendamentoId: appointment.id,
        filaId: queueQuery.data?.id,
        pacienteId: appointment.paciente_id,
        pacienteNome: nomePaciente,
        medicoId: appointment.medico_id ?? '',
        convenioId: patient?.convenio_id,
        tipoConsulta: appointment.tipo,
        tipoExame: ['exame', 'exames'].includes(String(appointment.tipo || '').toLocaleLowerCase('pt-BR'))
          ? appointment.observacoes ?? null
          : null,
        clinicaId,
        notificarPaciente: origem !== 'atendimentos-abertos',
        agendarRetorno: dias !== null,
        diasRetorno: dias ?? undefined,
      });

      if (!result.success) {
        toast.error('Não foi possível finalizar o atendimento', { description: result.message });
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agendamentos'] }),
        queryClient.invalidateQueries({ queryKey: ['fila_atendimento'] }),
        queryClient.invalidateQueries({ queryKey: ['atendimentos-em-aberto', clinicaId] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] }),
        queryClient.invalidateQueries({ queryKey: ['lancamentos_hoje'] }),
        queryClient.invalidateQueries({ queryKey: ['caixa-diario'] }),
      ]);
      paginaConcluida.current = true;
      const toastOptions = {
        description: result.actions.join(' • '),
        ...(origem === 'fila'
          ? { duration: 8000, action: { label: 'Abrir Caixa', onClick: () => navigate('/caixa') } }
          : {}),
      };
      toast.success(`Atendimento finalizado — ${nomePaciente}`, toastOptions);
      navigate(returnTo, { replace: true });
    } catch (error) {
      toast.error('Não foi possível finalizar o atendimento', {
        description: error instanceof Error ? error.message : 'Tente novamente. A escolha de retorno foi mantida.',
      });
    } finally {
      submitLock.current = false;
      setSalvando(false);
    }
  };

  const carregando = appointmentQuery.isLoading || queueQuery.isLoading;
  const erro = appointmentQuery.error ?? queueQuery.error;
  const statusFinalizavel = appointment?.status === 'em_atendimento';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-24 sm:pb-8">
      <UnsavedChangesGuard dirty={Boolean(retornoSelecionado)} busy={salvando} completed={paginaConcluida} />
      <PageHeader
        title="Finalizar atendimento"
        description="Revise os dados e registre se o paciente precisa retornar. A cobrança e o encerramento são processados juntos."
        icon={<CalendarCheck2 />}
        actions={(
          <Button type="button" variant="outline" onClick={() => navigate(returnTo)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
        )}
      />

      {carregando ? (
        <div role="status" className="flex min-h-40 items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> Carregando atendimento e fila…
        </div>
      ) : erro || !appointment ? (
        <section role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <h2 className="font-semibold text-foreground">Não foi possível abrir este atendimento</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {erro instanceof Error ? erro.message : 'O registro não existe ou você não tem acesso a ele nesta clínica.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {erro && <Button variant="outline" onClick={() => { void appointmentQuery.refetch(); void queueQuery.refetch(); }}>Tentar novamente</Button>}
            <Button variant="outline" onClick={() => navigate(returnTo)}>Voltar</Button>
          </div>
        </section>
      ) : (
        <>
          {!statusFinalizavel && (
            <div role="alert" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
              {appointment.status === 'finalizado'
                ? 'Este atendimento já foi finalizado. Volte à fila ou à recepção para conferir o estado atualizado.'
                : `O atendimento está como “${appointment.status}” e não pode ser finalizado neste estado. Atualize a fila antes de continuar.`}
            </div>
          )}

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
            <Card className="border-border shadow-none">
              <CardHeader className="border-b border-border pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">Dados do atendimento</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">Confirme o registro antes de concluir.</p>
                  </div>
                  <Badge variant={appointment.status === 'em_atendimento' ? 'default' : 'secondary'}>
                    {appointment.status === 'em_atendimento' ? 'Em atendimento' : 'Já finalizado'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 py-5 sm:grid-cols-2">
                <div className="flex min-w-0 gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><UserRound className="h-4 w-4" /></span>
                  <div className="min-w-0"><p className="text-xs text-muted-foreground">Paciente</p><p className="truncate font-medium">{nomePaciente}</p></div>
                </div>
                <div className="flex min-w-0 gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Stethoscope className="h-4 w-4" /></span>
                  <div className="min-w-0"><p className="text-xs text-muted-foreground">Profissional</p><p className="truncate font-medium">{doctor?.nome || 'Não informado'}</p></div>
                </div>
                <div className="flex min-w-0 gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><CalendarDays className="h-4 w-4" /></span>
                  <div className="min-w-0"><p className="text-xs text-muted-foreground">Data</p><p className="font-medium">{parseDateOnly(appointment.data) ? format(parseDateOnly(appointment.data)!, 'dd/MM/yyyy', { locale: ptBR }) : appointment.data || 'Não informada'}</p></div>
                </div>
                <div className="flex min-w-0 gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Clock3 className="h-4 w-4" /></span>
                  <div className="min-w-0"><p className="text-xs text-muted-foreground">Horário e tipo</p><p className="font-medium">{appointment.hora_inicio?.slice(0, 5) || 'Horário não informado'} · {appointment.tipo || 'Atendimento'}</p></div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Próximo cuidado</CardTitle>
                <p className="text-sm text-muted-foreground">Há indicação para agendar um retorno?</p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <fieldset disabled={salvando}>
                    <legend className="mb-3 text-sm font-medium">Escolha o prazo ou marque sem retorno</legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {RETORNO_OPCOES.map((dias) => {
                        const valor = String(dias);
                        const selecionado = retornoSelecionado === valor;
                        return (
                          <label key={dias} className={`relative flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${selecionado ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-muted/60'}`}>
                            <input className="sr-only" type="radio" name="retorno" value={valor} checked={selecionado} onChange={() => setRetornoSelecionado(valor)} aria-label={`${dias === 180 ? '6 meses' : `${dias} dias`}`} />
                            <span className="flex items-center justify-center">
                              {selecionado && <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
                              {dias === 180 ? '6 meses' : `${dias} dias`}
                            </span>
                            {selecionado && retornoEm && <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:hidden">Retorno em {retornoEm}</span>}
                          </label>
                        );
                      })}
                      <label className={`relative col-span-2 flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 sm:col-span-3 ${retornoSelecionado === 'sem-retorno' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-muted/60'}`}>
                        <input className="sr-only" type="radio" name="retorno" value="sem-retorno" checked={retornoSelecionado === 'sem-retorno'} onChange={() => setRetornoSelecionado('sem-retorno')} aria-label="Sem retorno" />
                        {retornoSelecionado === 'sem-retorno' && <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
                        Sem retorno
                      </label>
                    </div>
                  </fieldset>

                  <div aria-live="polite" className="sr-only sm:not-sr-only sm:min-h-14 sm:rounded-lg sm:border sm:border-border sm:bg-muted/30 sm:px-3 sm:py-3 sm:text-sm">
                    {retornoEm ? (
                      <><span className="font-medium text-foreground">Retorno previsto:</span> <span className="text-muted-foreground">{retornoEm}</span></>
                    ) : retornoSelecionado === 'sem-retorno' ? (
                      <span className="text-muted-foreground">Nenhum retorno será criado para este atendimento.</span>
                    ) : (
                      <span className="text-muted-foreground">Selecione uma opção para revisar a próxima etapa.</span>
                    )}
                  </div>

                  {!queueQuery.data && !queueQuery.isLoading && (
                    <p className="text-xs leading-5 text-muted-foreground">Este atendimento não tem uma entrada ativa na fila; a finalização será registrada no agendamento.</p>
                  )}

                  <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:flex-row sm:justify-end lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-0">
                    <Button type="button" variant="outline" onClick={() => navigate(returnTo)} disabled={salvando}>Voltar</Button>
                    <Button type="submit" disabled={!retornoSelecionado || salvando || !statusFinalizavel}>
                      {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                      {salvando ? 'Finalizando…' : 'Confirmar finalização'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
