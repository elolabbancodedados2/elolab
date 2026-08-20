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
import { supabase } from '@/integrations/supabase/client';

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
    title: 'Monte sua equipe',
    description: 'Convide ao menos uma pessoa e atribua o perfil adequado para o trabalho diário.',
    action: 'Gerenciar equipe', href: '/equipe', icon: UsersRound,
  },
  schedule: {
    title: 'Configure os horários',
    description: 'Defina dias de funcionamento, abertura, fechamento e duração das consultas.',
    action: 'Configurar horários', href: '/configuracoes', icon: Clock3,
  },
  services: {
    title: 'Cadastre seus serviços',
    description: 'Crie ao menos um tipo de consulta ativo com duração e valor.',
    action: 'Cadastrar serviço', href: '/precos-servicos', icon: Stethoscope,
  },
  whatsapp: {
    title: 'Conecte o WhatsApp',
    description: 'Crie uma sessão para centralizar conversas e preparar o atendimento automatizado.',
    action: 'Conectar WhatsApp', href: '/agente-ia', icon: MessageCircle,
  },
  appointment: {
    title: 'Crie a primeira agenda',
    description: 'Cadastre o primeiro agendamento real para validar o fluxo da recepção.',
    action: 'Abrir agenda', href: '/agenda', icon: CalendarCheck,
  },
} satisfies Record<StepKey, { title: string; description: string; action: string; href: string; icon: typeof UsersRound }>;

export default function OnboardingClinica() {
  const query = useQuery({
    queryKey: ['clinic-onboarding'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('clinic_onboarding_overview');
      if (error) throw error;
      return data as Overview;
    },
    staleTime: 0,
  });

  if (query.isLoading) {
    return <div className="space-y-5" aria-label="Carregando onboarding">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-52 w-full" />
      <Skeleton className="h-52 w-full" />
    </div>;
  }

  const overview = query.data;
  if (!overview) return null;

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
            <span className="font-medium">{overview.completed_steps} de {overview.total_steps} etapas concluídas</span>
            <span className="font-semibold text-primary">{overview.progress}%</span>
          </div>
          <Progress value={overview.progress} aria-label={`${overview.progress}% do onboarding concluído`} />
        </CardContent>
      </Card>
    </header>

    {overview.completed_at && <Alert className="border-emerald-500/40 bg-emerald-500/5">
      <PartyPopper className="h-4 w-4 text-emerald-600" />
      <AlertTitle>Clínica pronta para começar</AlertTitle>
      <AlertDescription>As cinco etapas essenciais foram validadas. Você pode voltar aqui quando quiser para revisar a configuração.</AlertDescription>
    </Alert>}

    <section className="grid gap-4 md:grid-cols-2" aria-label="Etapas do onboarding">
      {overview.steps.map((step, index) => {
        const definition = definitions[step.key];
        const Icon = definition.icon;
        return <Card key={step.key} className={step.complete ? 'border-emerald-500/40' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${step.complete ? 'bg-emerald-500 text-white' : 'bg-primary/10 text-primary'}`}>
                {step.complete ? <Check className="h-5 w-5" aria-hidden="true" /> : <Icon className="h-5 w-5" aria-hidden="true" />}
              </div>
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{index + 1}. {definition.title}</CardTitle>
                  <Badge variant={step.complete ? 'outline' : 'secondary'}>{step.complete ? 'Concluída' : 'Pendente'}</Badge>
                </div>
                <CardDescription>{definition.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild variant={step.complete ? 'outline' : 'default'} className="w-full sm:w-auto">
              <Link to={definition.href}>{step.complete ? 'Revisar' : definition.action}<ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>;
      })}
    </section>
  </div>;
}

