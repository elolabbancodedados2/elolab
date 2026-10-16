import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CalendarCheck, Check, Clock3, MessageCircle,
  PartyPopper, RefreshCw, Stethoscope, UsersRound,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useUserPlan } from '@/hooks/useSubscriptionPlan';

type StepKey = 'team' | 'schedule' | 'services' | 'whatsapp' | 'appointment';
type ApiStep = { key: StepKey; complete: boolean; count: number };
type Overview = {
  completed_steps: number;
  total_steps: number;
  progress: number;
  completed_at: string | null;
  steps: ApiStep[];
};

const definitions = {
  team: {
    title: 'Equipe e acessos',
    description: 'A conta de administrador já garante acesso à clínica. Convites para médicos e funcionários são opcionais; profissionais e horários são configurados na próxima etapa.',
    action: 'Gerenciar equipe', href: '/equipe?aba=funcionarios', icon: UsersRound,
  },
  schedule: {
    title: 'Configure os horários',
    description: 'Cadastre ou selecione um médico e informe em quais dias e horários ele atende.',
    action: 'Configurar disponibilidade', href: '/equipe?aba=medicos', icon: Clock3,
  },
  services: {
    title: 'Cadastre seus serviços',
    description: 'Crie ao menos um tipo de consulta ativo com duração e valor.',
    action: 'Cadastrar serviço', href: '/precos-servicos?tab=tipos', icon: Stethoscope,
  },
  whatsapp: {
    title: 'Conecte o WhatsApp (opcional)',
    description: 'Opcional: conecte uma sessão para centralizar conversas e preparar o atendimento automatizado.',
    action: 'Conectar WhatsApp', href: '/agente-ia', icon: MessageCircle,
  },
  appointment: {
    title: 'Crie a primeira agenda',
    description: 'Crie um agendamento para conferir o fluxo completo com profissional, serviço e horário.',
    action: 'Criar primeiro agendamento', href: '/agenda', icon: CalendarCheck,
  },
} satisfies Record<StepKey, { title: string; description: string; action: string; href: string; icon: typeof UsersRound }>;

export default function OnboardingClinica() {
  const { user, profile, isLoading: authLoading, refreshProfile } = useSupabaseAuth();
  const { hasFeature, isLoading: planLoading } = useUserPlan();
  const query = useQuery({
    queryKey: ['clinic-onboarding', user?.id ?? null, profile?.clinica_id ?? null],
    enabled: !!user && !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('clinic_onboarding_overview');
      if (error) throw error;
      return data as Overview;
    },
    staleTime: 0,
  });

  if (authLoading || planLoading || (!!profile?.clinica_id && query.isLoading)) {
    return <div className="space-y-5" role="status" aria-live="polite" aria-busy="true" aria-label="Carregando onboarding">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-52 w-full" />
      <Skeleton className="h-52 w-full" />
    </div>;
  }

  if (query.isError) {
    return <ErrorState
      title="Não foi possível carregar o onboarding"
      error={query.error}
      onRetry={() => void query.refetch()}
    />;
  }

  const overview = query.data;
  if (!overview) {
    return <ErrorState
      title="Progresso do onboarding indisponível"
      description={profile?.clinica_id
        ? 'Não encontramos os dados de configuração da clínica. Atualize para tentar novamente.'
        : 'Esta conta ainda não está vinculada a uma clínica. Atualize o perfil ou peça ao administrador para verificar o vínculo.'}
      onRetry={profile?.clinica_id ? () => void query.refetch() : () => void refreshProfile()}
      retryLabel={profile?.clinica_id ? 'Tentar novamente' : 'Atualizar perfil'}
    />;
  }

  return <div className="mx-auto max-w-5xl space-y-6 pb-10">
    <header className="space-y-3">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <Badge variant="secondary" className="mb-2">Primeiros passos</Badge>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Prepare sua clínica para atender</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">
            O progresso é atualizado pelos cadastros reais da clínica. Conclua as etapas na ordem que preferir.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
          Atualizar progresso
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{overview.completed_steps} de {overview.total_steps} etapas essenciais concluídas</span>
            <span className="font-semibold text-primary">{overview.progress}%</span>
          </div>
          <Progress value={overview.progress} aria-label={`${overview.progress}% do onboarding concluído`} />
        </CardContent>
      </Card>
    </header>

    {overview.completed_at && <Alert className="border-emerald-500/40 bg-emerald-500/5">
      <PartyPopper className="h-4 w-4 text-emerald-600" />
      <AlertTitle>Clínica pronta para começar</AlertTitle>
          <AlertDescription>As etapas essenciais foram validadas. Você pode voltar aqui quando quiser para revisar a configuração.</AlertDescription>
    </Alert>}

    <section className="grid gap-4 md:grid-cols-2" aria-label="Etapas do onboarding">
      {overview.steps.map((step, index) => {
        const definition = definitions[step.key];
        const upsellAgentIA = step.key === 'whatsapp' && !hasFeature('agente_ia');
        const title = upsellAgentIA ? 'Atendente de IA no WhatsApp' : definition.title;
        const description = upsellAgentIA
          ? 'Disponível no EloLab Ultra. Esta etapa é opcional e não impede a clínica de começar a usar o EloLab Pro.'
          : definition.description;
        const Icon = definition.icon;
        const countLabel = {
          team: step.count === 0 ? 'Nenhum usuário ativo com função de acesso' : step.count === 1 ? '1 usuário ativo com função de acesso' : `${step.count} usuários ativos com função de acesso`,
          schedule: step.count === 0 ? 'Nenhum profissional com horários disponíveis ainda' : step.count === 1 ? '1 profissional com horários disponíveis' : `${step.count} profissionais com horários disponíveis`,
          services: step.count === 0 ? 'Nenhum serviço ativo ainda' : step.count === 1 ? '1 serviço ativo' : `${step.count} serviços ativos`,
          whatsapp: step.count === 0 ? 'Nenhuma sessão conectada ainda' : step.count === 1 ? '1 sessão conectada' : `${step.count} sessões conectadas`,
          appointment: step.count === 0 ? 'Nenhum agendamento cadastrado ainda' : step.count === 1 ? '1 agendamento cadastrado' : `${step.count} agendamentos cadastrados`,
        }[step.key];
        return <Card key={step.key} className={step.complete ? 'border-emerald-500/40' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${step.complete ? 'bg-emerald-500 text-white' : 'bg-primary/10 text-primary'}`}>
                {step.complete ? <Check className="h-5 w-5" aria-hidden="true" /> : <Icon className="h-5 w-5" aria-hidden="true" />}
              </div>
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{step.key === 'whatsapp' ? title : `${overview.steps.slice(0, index + 1).filter((item) => item.key !== 'whatsapp').length}. ${title}`}</CardTitle>
                  <Badge variant={step.complete ? 'outline' : 'secondary'}>{step.complete ? 'Concluída' : step.key === 'whatsapp' ? 'Opcional' : 'Pendente'}</Badge>
                </div>
                <CardDescription>{description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">{countLabel}</p>
            <Button asChild variant={step.complete ? 'outline' : 'default'} className="w-full sm:w-auto">
              <Link to={upsellAgentIA ? '/planos' : definition.href}>{step.complete && step.key !== 'team' ? 'Revisar' : upsellAgentIA ? 'Ver planos' : definition.action}<ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            {step.key === 'schedule' && <Button asChild variant="link" className="ml-0 mt-2 w-full sm:ml-2 sm:mt-0 sm:w-auto">
              <Link to="/configuracoes?tab=horarios">Configurar horário de funcionamento<ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>}
            {step.key === 'schedule' && !step.complete && <p className="mt-2 text-xs text-muted-foreground">
              Se você também atende, use o e-mail desta conta no perfil médico e aceite o convite com esta mesma conta. Não é necessário criar outro usuário; depois, edite o cadastro e configure os horários.
            </p>}
          </CardContent>
        </Card>;
      })}
    </section>
  </div>;
}
