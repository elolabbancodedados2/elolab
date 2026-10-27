import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import logoHorizontal from '@/assets/elolab-logo-identidade.png';
import { COOKIE_CONSENT_EVENT, hasConsented } from '@/lib/cookies';

const ANNOUNCEMENT_VERSION = '2.0';
const STORAGE_PREFIX = 'elolab-announcement-seen';

export function Version20Announcement() {
  const { user } = useSupabaseAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const storageKey = `${STORAGE_PREFIX}:${ANNOUNCEMENT_VERSION}:${user.id}`;
    // Só abre depois da escolha de cookies, para não empilhar com o banner.
    const check = () => {
      if (!hasConsented()) return;
      try {
        setOpen(window.localStorage.getItem(storageKey) !== 'true');
      } catch {
        setOpen(true);
      }
    };
    check();
    window.addEventListener(COOKIE_CONSENT_EVENT, check);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, check);
  }, [user?.id]);

  const dismiss = () => {
    if (user?.id) {
      try {
        window.localStorage.setItem(
          `${STORAGE_PREFIX}:${ANNOUNCEMENT_VERSION}:${user.id}`,
          'true',
        );
      } catch {
        // A indisponibilidade do armazenamento não deve impedir o fechamento.
      }
    }
    setOpen(false);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && dismiss()}>
      <DialogContent className="overflow-hidden border-0 p-0 sm:max-w-lg">
        <div className="relative overflow-hidden bg-[#0a5d94] px-6 pb-7 pt-8 text-white sm:px-8">
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-5 -top-9 h-32 w-32 rounded-full border border-white/10" />
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
            <Sparkles className="h-5 w-5 text-[#1080CA]" aria-hidden="true" />
          </div>
          <p className="relative mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#AEEFFF]">
            Uma nova etapa começa
          </p>
          <h2 className="relative mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            EloLab 2.0
          </h2>
          <p className="relative mt-3 max-w-md text-sm leading-6 text-white/85 sm:text-base">
            Interface renovada e melhorias nos módulos de atendimento, prontuário e financeiro.
          </p>
          <img
            src={logoHorizontal}
            alt="EloLab"
            className="relative mt-6 w-32 object-contain brightness-0 invert"
          />
        </div>

        <div className="px-6 pb-6 pt-5 sm:px-8">
          <DialogHeader className="sr-only">
            <DialogTitle>EloLab 2.0</DialogTitle>
            <DialogDescription>
              Interface renovada e melhorias nos módulos de atendimento, prontuário e financeiro.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            Seus dados, configurações e históricos continuam os mesmos. Em caso de dúvida, fale com o suporte.
          </p>
          <DialogFooter className="mt-5">
            <Button onClick={dismiss} className="w-full gap-2 sm:w-auto">
              Entendi
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
