import { useMemo } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppointmentForm } from '@/components/agenda/AppointmentDialog';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ErrorState';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useCurrentMedico } from '@/hooks/useCurrentMedico';
import { useMedicos, useSupabaseQuery } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import { isValidAgendaDate } from '@/lib/agendaDate';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { mensagemDeErro } from '@/lib/erros';

export default function AppointmentPage() {
  const { appointmentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const { profile } = useSupabaseAuth();
  const currentMedico = useCurrentMedico();
  const medicos = useMedicos();
  const tipos = useSupabaseQuery<any>('tipos_consulta', { orderBy: { column: 'nome', ascending: true } });
  const salas = useSupabaseQuery<any>('salas', { orderBy: { column: 'nome', ascending: true } });
  // Opcional: sem a lista, o campo Convênio fica só com "do cadastro".
  const convenios = useSupabaseQuery<any>('convenios', { orderBy: { column: 'nome', ascending: true }, suppressGlobalErrorToast: true });
  const date = isValidAgendaDate(params.get('data')) ? params.get('data')! : todaySaoPauloDateOnly();
  const appointment = useQuery({
    queryKey: ['agendamento-edicao', profile?.clinica_id, appointmentId, currentMedico.isMedicoOnly ? currentMedico.medicoId : null],
    enabled: !!appointmentId && !!profile?.clinica_id && (!currentMedico.isMedicoOnly || !!currentMedico.medicoId),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      let query = supabase.from('agendamentos').select('*').eq('id', appointmentId!).eq('clinica_id', profile!.clinica_id!);
      if (currentMedico.isMedicoOnly) query = query.eq('medico_id', currentMedico.medicoId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const initial = useMemo(() => appointmentId ? appointment.data : {
    ...location.state?.initial,
    data: location.state?.initial?.data || date,
    medico_id: currentMedico.isMedicoOnly ? currentMedico.medicoId : location.state?.initial?.medico_id || '',
  }, [appointmentId, appointment.data, location.state, date, currentMedico.isMedicoOnly, currentMedico.medicoId]);
  const returnTo = /^\/agenda(?:\?|$)/.test(location.state?.returnTo ?? '')
    ? location.state.returnTo : `/agenda?data=${appointment.data?.data || date}`;
  const leave = () => navigate(returnTo, { state: { agendaFilters: location.state?.agendaFilters }, replace: true });
  const queries = [medicos, tipos, salas, ...(appointmentId ? [appointment] : [])];
  const errorQuery = queries.find(query => query.isError);

  async function afterSave() {
    await queryClient.invalidateQueries({ queryKey: ['agendamento-edicao'], refetchType: 'none' });
    const waitingId = initial?._waiting_id;
    if (!waitingId) return;
    try {
      const { data, error } = await supabase.from('lista_espera')
        .update({ status: 'agendado' }).eq('id', waitingId)
        .eq('clinica_id', profile?.clinica_id || '')
        .eq('status', initial?._waiting_status || 'aguardando')
        .select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A vaga pode ter sido atualizada em outra tela. Confira a lista de espera.');
    } catch (error) {
      toast.warning('Consulta salva, mas a lista de espera precisa de conferência.', { description: mensagemDeErro(error) });
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['lista_espera'] });
    }
  }

  if (errorQuery || currentMedico.error) return <div className="space-y-4">
    <Button variant="outline" onClick={leave}>Voltar à agenda</Button>
    <ErrorState title="Não foi possível preparar a consulta" error={errorQuery?.error || currentMedico.error} onRetry={() => { void errorQuery?.refetch(); void currentMedico.refetch(); }} />
  </div>;
  if (currentMedico.isLoading || queries.some(query => query.isLoading)) return <div role="status" className="mx-auto max-w-5xl space-y-6 py-8">
    <h1 className="text-2xl font-semibold">{appointmentId ? 'Editar consulta' : 'Nova consulta'}</h1>
    <p className="text-muted-foreground">Carregando profissionais, salas e dados da consulta…</p>
  </div>;
  if ((currentMedico.isMedicoOnly && !currentMedico.medicoId) || (appointmentId && !appointment.data)) return <div className="space-y-4">
    <h1 className="text-2xl font-semibold">Consulta indisponível</h1>
    <p>O registro não foi encontrado ou não está disponível para seu perfil nesta clínica.</p>
    <Button variant="outline" onClick={leave}>Voltar à agenda</Button>
  </div>;

  return <AppointmentForm key={appointmentId || location.key} open initial={initial}
    medicos={(medicos.data || []).filter((medico: any) => !currentMedico.isMedicoOnly || medico.id === currentMedico.medicoId)}
    tipos={tipos.data || []} salas={salas.data || []} convenios={convenios.data || []} onOpenChange={open => { if (!open) leave(); }} onSaved={afterSave} />;
}
