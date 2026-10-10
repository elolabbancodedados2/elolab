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

const ANNOUNCEMENT_VERSION = '2.0';
const STORAGE_PREFIX = 'elolab-announcement-seen';

export function Version20Announcement() {
  const { user } = useSupabaseAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const storageKey = `${STORAGE_PREFIX}:${ANNOUNCEMENT_VERSION}:${user.id}`;
    try {
      setOpen(window.localStorage.getItem(storageKey) !== 'true');
    } catch {
      setOpen(true);
    }
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
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0C1F54] via-[#0F3F8C] to-[#0F7BFD] px-6 pb-7 pt-8 text-white sm:px-8">
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-5 -top-9 h-32 w-32 rounded-full border border-white/10" />
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
            <Sparkles className="h-5 w-5 text-[#50E3FB]" aria-hidden="true" />
          </div>
          <p className="relative mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#AEEFFF]">
            Uma nova etapa começa
          </p>
          <h2 className="relative mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            EloLab 2.0
          </h2>
          <p className="relative mt-3 max-w-md text-sm leading-6 text-white/85 sm:text-base">
            Estamos atualizando a plataforma para uma nova versão, com uma experiência mais moderna e melhorias nos módulos do dia a dia.
          </p>
          <img
            src={logoHorizontal}
            alt="EloLab"
            className="relative mt-6 w-32 object-contain brightness-0 invert"
          />
        </div>

        <div className="px-6 pb-6 pt-5 sm:px-8">
          <DialogHeader className="sr-only">
            <DialogTitle>Estamos atualizando para o EloLab 2.0</DialogTitle>
            <DialogDescription>
              A plataforma está recebendo uma atualização para uma experiência mais moderna.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            As novidades serão disponibilizadas gradualmente. Obrigado por fazer parte dessa evolução.
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
