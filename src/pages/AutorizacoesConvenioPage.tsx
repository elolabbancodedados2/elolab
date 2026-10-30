import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Phone } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ErrorState';
import { AutorizacaoConvenioWorkspace } from '@/components/patients/AutorizacaoConvenioWorkspace';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { autorizarLeituraHistoricoPaciente } from '@/lib/prontuarioAudit';

interface PacienteContexto {
  id: string;
  nome: string;
  nome_social: string | null;
  convenio_id: string | null;
}

interface StateRetorno {
  patientReturnTo?: unknown;
  patientReturnState?: unknown;
}

function destinoSeguro(value: unknown, patientId: string) {
  if (typeof value === 'string' && /^\/pacientes(?:\/[^/?#]+)?(?:\?[^#]*)?$/.test(value)) return value;
  return `/pacientes/${encodeURIComponent(patientId)}`;
}

export default function AutorizacoesConvenioPage() {
  const { patientId = '' } = useParams();
  const { profile, isLoading: authLoading } = useSupabaseAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLElement>(null);
  const returnState = location.state as StateRetorno | null;
  const returnTo = destinoSeguro(returnState?.patientReturnTo, patientId);

  const pacienteQuery = useQuery({
    queryKey: ['paciente-autorizacoes-convenio', profile?.clinica_id ?? null, patientId],
    enabled: Boolean(profile?.clinica_id && patientId),
    queryFn: async (): Promise<PacienteContexto | null> => {
      if (!profile?.clinica_id || !patientId) throw new Error('Clínica ou paciente não identificado.');
      await autorizarLeituraHistoricoPaciente(patientId);
      const { data, error } = await supabase
        .from('pacientes')
        .select('id, nome, nome_social, convenio_id')
        .eq('clinica_id', profile.clinica_id)
        .eq('id', patientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    pageRef.current?.focus({ preventScroll: true });
  }, []);

  const voltar = () => navigate(returnTo, { state: returnState?.patientReturnState });

  if (!authLoading && (!profile?.clinica_id || !patientId)) {
    return <main ref={pageRef} tabIndex={-1} className="mx-auto w-full max-w-5xl space-y-5 outline-none">
      <PageHeader title="Contexto do paciente indisponível" icon={<Phone />} actions={<Button asChild variant="outline"><Link to="/pacientes"><ArrowLeft className="mr-2 h-4 w-4" />Voltar à lista</Link></Button>} />
      <p role="status" className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Abra esta tarefa a partir de uma ficha de paciente da clínica atual.
      </p>
    </main>;
  }

  if (authLoading || pacienteQuery.isLoading) {
    return <main ref={pageRef} tabIndex={-1} className="mx-auto w-full max-w-5xl outline-none" aria-busy="true">
      <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-5 w-5 animate-spin" />Carregando o contexto do paciente…
      </div>
    </main>;
  }

  if (pacienteQuery.isError) {
    return <main ref={pageRef} tabIndex={-1} className="mx-auto w-full max-w-5xl space-y-5 outline-none">
      <PageHeader title="Autorizações do convênio" icon={<Phone />} actions={<Button asChild variant="outline"><Link to={returnTo} state={returnState?.patientReturnState}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao paciente</Link></Button>} />
      <ErrorState title="Não foi possível carregar o paciente" error={pacienteQuery.error} onRetry={() => void pacienteQuery.refetch()} />
    </main>;
  }

  if (!pacienteQuery.data) {
    return <main ref={pageRef} tabIndex={-1} className="mx-auto w-full max-w-5xl space-y-5 outline-none">
      <PageHeader title="Paciente indisponível" icon={<Phone />} actions={<Button asChild variant="outline"><Link to={returnTo} state={returnState?.patientReturnState}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao paciente</Link></Button>} />
      <p role="status" className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Este paciente não está disponível para a clínica atual. Volte à ficha e confira se o contexto está correto.
      </p>
    </main>;
  }

  const paciente = pacienteQuery.data;
  return <main ref={pageRef} tabIndex={-1} className="outline-none">
    <AutorizacaoConvenioWorkspace
      pacienteId={paciente.id}
      pacienteNome={paciente.nome_social || paciente.nome}
      convenioId={paciente.convenio_id || undefined}
      onExit={voltar}
    />
  </main>;
}
