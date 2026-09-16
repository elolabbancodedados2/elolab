import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Calendar, Users, FileText, BarChart3, Stethoscope,
  ArrowRight, CheckCircle2, Sparkles, Rocket
} from 'lucide-react';

const steps = [
  {
    icon: Sparkles,
    title: 'Bem-vindo ao EloLab!',
    description: 'Seu novo sistema de gestão clínica está pronto. Vamos fazer um tour rápido pelas principais funcionalidades.',
    color: 'hsl(168, 76%, 36%)',
  },
  {
    icon: Calendar,
    title: 'Agenda Inteligente',
    description: 'Gerencie consultas, defina horários de médicos, configure recorrências e envie lembretes automáticos via WhatsApp.',
    color: 'hsl(168, 76%, 42%)',
  },
  {
    icon: Users,
    title: 'Gestão de Pacientes',
    description: 'Cadastre pacientes com foto, convênio, alergias e histórico completo. Tudo em conformidade com a LGPD.',
    color: 'hsl(168, 76%, 30%)',
  },
  {
    icon: FileText,
    title: 'Prontuário Eletrônico',
    description: 'Registre consultas, prescrições, atestados e exames. Acesse o histórico clínico completo de qualquer dispositivo.',
    color: 'hsl(215, 28%, 35%)',
  },
  {
    icon: BarChart3,
    title: 'Financeiro e Relatórios',
    description: 'Controle fluxo de caixa, contas a pagar/receber, faturamento de convênios e analise KPIs da sua clínica.',
    color: 'hsl(168, 76%, 36%)',
  },
  {
    icon: Rocket,
    title: 'Tudo pronto!',
    description: 'Explore os módulos no menu lateral. Use Ctrl+K para busca rápida e Alt+1-9 para atalhos. Bom trabalho!',
    color: 'hsl(168, 76%, 36%)',
  },
];

export function OnboardingWizard() {
  const { profile } = useSupabaseAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!profile) return;

    // Check localStorage first (instant, avoids flicker)
    const localKey = `onboarding_done_${profile.id}`;
    if (localStorage.getItem(localKey) === 'true') return;

    const checkOnboarding = async () => {
      const { data, error } = await supabase
        .from('configuracoes_clinica')
        .select('valor')
        .eq('chave', 'onboarding_completed')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (error) {
        if (import.meta.env.DEV) console.error('Falha ao consultar onboarding:', error);
        return;
      }
      if (data) {
        // Already completed — cache locally so we never ask again
        localStorage.setItem(localKey, 'true');
      } else {
        setTimeout(() => setOpen(true), 1200);
      }
    };
    checkOnboarding();
  }, [profile]);

  const handleComplete = async () => {
    if (profile) {
      const localKey = `onboarding_done_${profile.id}`;
      const { error } = await supabase.from('configuracoes_clinica').upsert({
        chave: 'onboarding_completed',
        user_id: profile.id,
        valor: new Date().toISOString() as any,
      }, { onConflict: 'user_id,chave' });
      if (error) {
        if (import.meta.env.DEV) console.error('Falha ao salvar onboarding:', error);
        toast.error('Não foi possível salvar a conclusão do tour', { description: 'Tente novamente.' });
        return;
      }
      localStorage.setItem(localKey, 'true');
    }
    setOpen(false);
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const currentStep = steps[step];
  const Icon = currentStep.icon;
  const isLast = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleComplete(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0">
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-[hsl(168,76%,36%)] transition-all duration-500 ease-out"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="p-8 text-center">
          {/* Icon */}
          <div
            className="mx-auto mb-6 h-20 w-20 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ backgroundColor: `${currentStep.color}` }}
          >
            <Icon className="h-10 w-10 text-white" />
          </div>

          {/* Content */}
          <h2 className="text-2xl font-bold text-foreground mb-3">
            {currentStep.title}
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-8">
            {currentStep.description}
          </p>

          {/* Step indicators */}
          <div className="flex justify-center gap-2 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === step
                    ? 'w-8 bg-[hsl(168,76%,36%)]'
                    : i < step
                    ? 'w-2 bg-[hsl(168,76%,36%)]/40'
                    : 'w-2 bg-muted-foreground/20'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {step > 0 && (
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                className="flex-1"
              >
                Voltar
              </Button>
            )}
            <Button
              onClick={handleNext}
              className="flex-1 bg-[hsl(168,76%,36%)] hover:bg-[hsl(168,76%,30%)] text-white"
            >
              {isLast ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Começar
                </>
              ) : (
                <>
                  Próximo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>

          {/* Skip */}
          {!isLast && (
            <button
              onClick={handleComplete}
              className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Pular tour
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
