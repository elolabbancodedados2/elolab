import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BookOpenCheck, Check, Loader2, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { AppRole } from '@/contexts/SupabaseAuthContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { tutorials, type Tutorial } from '@/lib/treinamentoTutoriais';

export default function Treinamento() {
  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { tutorialKey } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [saving, setSaving] = useState(false);
  const finishLock = useRef(false);
  const roles = profile?.roles ?? [];
  const visible = useMemo(() => tutorials
    .filter(t => t.roles.some(role => roles.includes(role)))
    .map(t => ({ ...t, steps: t.steps.filter(s => !s.roles || s.roles.some(role => roles.includes(role))) })), [roles]);
  const active = tutorialKey ? visible.find(tutorial => tutorial.key === tutorialKey) ?? null : null;
  const requestedStep = Number(searchParams.get('etapa') ?? '0');
  const step = active && Number.isInteger(requestedStep) && requestedStep >= 0 && requestedStep < active.steps.length ? requestedStep : 0;
  const progress = useQuery({
    queryKey: ['training-progress', user?.id, profile?.clinica_id],
    enabled: Boolean(user?.id && profile?.clinica_id),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('user_training_progress').select('tutorial_key').eq('user_id', user!.id).eq('clinica_id', profile!.clinica_id);
      if (error) throw error;
      return new Set<string>((data ?? []).map((row: { tutorial_key: string }) => row.tutorial_key));
    },
  });
  const completed = progress.data ?? new Set<string>();
  const percentage = visible.length ? Math.round((visible.filter(t => completed.has(t.key)).length / visible.length) * 100) : 0;

  function start(tutorial: Tutorial) { navigate(`/treinamento/${tutorial.key}`); }
  function changeStep(nextStep: number) {
    if (!active) return;
    const clampedStep = Math.max(0, Math.min(nextStep, active.steps.length - 1));
    const nextParams = new URLSearchParams(searchParams);
    if (clampedStep === 0) nextParams.delete('etapa');
    else nextParams.set('etapa', String(clampedStep));
    setSearchParams(nextParams);
  }
  async function finish() {
    if (finishLock.current || !active || !user?.id || !profile?.clinica_id) return;
    finishLock.current = true;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from('user_training_progress').upsert({ user_id: user.id, clinica_id: profile.clinica_id, tutorial_key: active.key, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'user_id,clinica_id,tutorial_key' });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['training-progress', user.id, profile.clinica_id] });
      navigate('/treinamento', { replace: true });
      toast.success('Tutorial concluído');
    } catch {
      toast.error('Não foi possível salvar o progresso', { description: 'O tutorial continua disponível. Tente concluir novamente.' });
    } finally {
      finishLock.current = false;
      setSaving(false);
    }
  }

  if (tutorialKey) {
    if (!active) {
      return (
        <main className="mx-auto w-full max-w-4xl space-y-6 pb-24 sm:pb-8" aria-label="Tutorial de treinamento indisponível">
          <PageHeader
            title="Tutorial não disponível"
            description="Este roteiro não existe ou não está disponível para a sua função."
            icon={<BookOpenCheck />}
            actions={<Button variant="outline" asChild><Link to="/treinamento"><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao treinamento</Link></Button>}
          />
        </main>
      );
    }

    const currentStep = active.steps[step];
    return (
      <main className="mx-auto w-full max-w-4xl space-y-6 pb-36 sm:pb-8" aria-label={`Tutorial: ${active.title}`}>
        <PageHeader
          title={active.title}
          description={active.description}
          icon={<BookOpenCheck />}
          actions={<Button variant="outline" asChild><Link to="/treinamento"><ArrowLeft className="mr-2 h-4 w-4" />Todos os roteiros</Link></Button>}
        />

        <section aria-label="Progresso do tutorial" className="space-y-2 rounded-xl border border-border bg-card px-5 py-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">Etapa {step + 1} de {active.steps.length}</span>
            <span className="text-muted-foreground">Cerca de {active.minutes} min</span>
          </div>
          <Progress value={((step + 1) / active.steps.length) * 100} aria-label={`Etapa ${step + 1} de ${active.steps.length}`} />
        </section>

        <Card className="overflow-hidden rounded-xl border-border shadow-sm">
          <CardHeader className="border-b border-border bg-card px-5 py-6 sm:px-8 sm:py-8">
            <Badge variant="outline" className="w-fit">Etapa {step + 1}</Badge>
            <CardTitle className="pt-2 text-xl sm:text-2xl">{currentStep.title}</CardTitle>
            <CardDescription className="max-w-2xl text-base leading-7">{currentStep.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
            {currentStep.href && (
              <Button variant="outline" className="min-h-11 w-full justify-between sm:w-auto" asChild>
                <Link to={currentStep.href} target="_blank" rel="noreferrer">
                  {currentStep.action}<ArrowRight className="ml-3 h-4 w-4" />
                </Link>
              </Button>
            )}
            <footer className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="ghost" className="min-h-11" disabled={step === 0 || saving} onClick={() => changeStep(step - 1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Anterior
              </Button>
              {step < active.steps.length - 1 ? (
                <Button type="button" className="min-h-11" onClick={() => changeStep(step + 1)}>
                  Próxima etapa <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" className="min-h-11" disabled={saving} onClick={() => void finish()}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  {saving ? 'Salvando…' : 'Concluir tutorial'}
                </Button>
              )}
            </footer>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <main className="mx-auto w-full max-w-6xl space-y-6 pb-24 sm:pb-8" aria-label="Central de treinamento">
    <PageHeader
      title="Treinamento e documentação"
      description={`Roteiros curtos para dominar seu fluxo. Você pode repetir qualquer tutorial sem criar ou alterar dados da clínica. ${visible.length ? `${visible.filter(t => completed.has(t.key)).length} de ${visible.length} concluídos.` : ''}`}
      icon={<BookOpenCheck />}
    />
    <Alert role="note" className="rounded-2xl border-primary/20 bg-primary/[0.03]"><ShieldCheck className="h-4 w-4 text-primary"/><AlertTitle>Treinamento sem dados fictícios</AlertTitle><AlertDescription>Os roteiros apenas orientam a navegação. Nenhum paciente, consulta, prontuário ou lançamento financeiro é criado automaticamente.</AlertDescription></Alert>
    {!profile?.clinica_id ? <Alert variant="destructive" className="rounded-2xl"><AlertTitle>Clínica não identificada</AlertTitle><AlertDescription>Vincule seu usuário a uma clínica para carregar e salvar seu progresso de treinamento.</AlertDescription></Alert> : <>
      {progress.isError ? <Alert variant="destructive" className="rounded-2xl"><AlertTitle>Não foi possível carregar seu progresso</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>Os roteiros continuam disponíveis; o histórico de conclusão não foi carregado.</span><Button variant="outline" size="sm" className="rounded-full" onClick={() => progress.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Tentar novamente</Button></AlertDescription></Alert> : progress.isLoading ? <div className="space-y-3" aria-label="Carregando progresso"><Skeleton className="h-24 w-full rounded-2xl"/></div> : <Card className="rounded-2xl border-border/60 shadow-xs"><CardContent className="pt-6"><div className="mb-2 flex items-center justify-between gap-4 text-sm"><span className="font-medium">{visible.filter(t => completed.has(t.key)).length} de {visible.length} roteiros concluídos</span><span className="font-semibold text-primary">{percentage}%</span></div><Progress value={percentage} aria-label={`${percentage}% dos treinamentos concluídos`}/></CardContent></Card>}
      <section className="grid gap-4 md:grid-cols-2" aria-label="Tutoriais disponíveis">{visible.map(tutorial => { const done = completed.has(tutorial.key); return <Card key={tutorial.key} className={cn('rounded-2xl border-border/60 shadow-xs', done && 'border-success/25')}><CardHeader><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-foreground"><BookOpenCheck className="h-5 w-5" aria-hidden="true"/></span><div><CardTitle className="text-lg">{tutorial.title}</CardTitle><CardDescription className="mt-1 leading-5">{tutorial.description}</CardDescription></div></div>{done && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success" title="Concluído"><Check className="h-4 w-4" aria-hidden="true"/><span className="sr-only">Concluído</span></span>}</div></CardHeader><CardContent className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><span className="text-sm text-muted-foreground">{tutorial.steps.length} etapas · cerca de {tutorial.minutes} min</span><Button className="min-h-11 w-full rounded-full sm:w-auto" variant={done ? 'outline' : 'default'} onClick={() => start(tutorial)}><Play className="mr-2 h-4 w-4" aria-hidden="true"/>{done ? 'Repetir tutorial' : 'Começar tutorial'}</Button></CardContent></Card>})}</section>
    </>}
  </main>;
}
