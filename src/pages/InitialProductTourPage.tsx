import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, BarChart3, Calendar, CheckCircle2, FileText,
  Rocket, Sparkles, Users,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const steps = [
  {
    icon: Sparkles,
    title: 'Bem-vindo ao EloLab',
    description: 'Este tour apresenta os principais espaços do sistema. Você pode sair quando quiser e continuar trabalhando.',
  },
  {
    icon: Calendar,
    title: 'Agenda e atendimento',
    description: 'Organize consultas, disponibilidade da equipe e retornos em um fluxo conectado à recepção.',
  },
  {
    icon: Users,
    title: 'Pacientes',
    description: 'Acesse os dados da pessoa, o histórico e as informações necessárias para dar continuidade ao atendimento.',
  },
  {
    icon: FileText,
    title: 'Prontuário e documentos',
    description: 'Registre evoluções e consulte prescrições, atestados e exames conforme suas permissões.',
  },
  {
    icon: BarChart3,
    title: 'Financeiro e relatórios',
    description: 'Acompanhe caixa, contas, faturamento e relatórios de acordo com o acesso da sua função.',
  },
  {
    icon: Rocket,
    title: 'Pronto para explorar',
    description: 'Use a busca global para encontrar módulos e consulte Treinamento e Ajuda quando precisar.',
  },
];

export default function InitialProductTourPage() {
  const { profile } = useSupabaseAuth();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const currentStep = steps[stepIndex];
  const Icon = currentStep.icon;
  const isLastStep = stepIndex === steps.length - 1;

  const finishTour = async () => {
    if (!profile?.id || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const { error } = await supabase.from('configuracoes_clinica').upsert({
        chave: 'onboarding_completed',
        user_id: profile.id,
        valor: new Date().toISOString(),
      }, { onConflict: 'user_id,chave' });
      if (error) throw error;
      localStorage.setItem(`onboarding_done_${profile.id}`, 'true');
      toast.success('Tour concluído', { description: 'Você pode explorar os módulos pelo menu e pela busca global.' });
      navigate('/dashboard', { replace: true });
    } catch {
      setSaveError('Não foi possível registrar a conclusão. Tente novamente; seu progresso nesta tela foi mantido.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 pb-24 sm:px-6 md:pb-6">
      <PageHeader
        title="Tour do EloLab"
        description="Conheça os principais espaços do sistema no seu ritmo."
        icon={<Sparkles />}
        actions={<Button type="button" variant="outline" onClick={() => navigate('/dashboard')} disabled={saving}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao dashboard</Button>}
      />

      <Card>
        <CardContent className="space-y-6 p-5 sm:p-8">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-medium">Etapa {stepIndex + 1} de {steps.length}</p>
              <p className="text-muted-foreground">{Math.round(((stepIndex + 1) / steps.length) * 100)}%</p>
            </div>
            <Progress value={((stepIndex + 1) / steps.length) * 100} aria-label={`Etapa ${stepIndex + 1} de ${steps.length}`} />
          </div>

          <section aria-live="polite" aria-atomic="true" className="min-h-56 rounded-xl border border-border bg-background p-5 sm:p-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{currentStep.title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{currentStep.description}</p>
          </section>

          {saveError && <Alert variant="destructive"><AlertTitle>Conclusão não registrada</AlertTitle><AlertDescription>{saveError}</AlertDescription></Alert>}

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setStepIndex(index => Math.max(0, index - 1))} disabled={stepIndex === 0 || saving} className="gap-2">
                <ArrowLeft className="h-4 w-4" />Voltar
              </Button>
              {isLastStep ? (
                <Button type="button" onClick={() => void finishTour()} disabled={saving} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />{saving ? 'Salvando…' : 'Concluir tour'}
                </Button>
              ) : (
                <Button type="button" onClick={() => setStepIndex(index => Math.min(steps.length - 1, index + 1))} className="gap-2">
                  Próxima etapa<ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
