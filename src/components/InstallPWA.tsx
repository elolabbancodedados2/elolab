import { useState, useEffect } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPWA() {
  const { user, profile } = useSupabaseAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  // Only show for authenticated users with roles (meaning they have a subscription/access)
  const isAuthorized = !!user && !!profile && profile.roles.length > 0;

  useEffect(() => {
    if (!isAuthorized) {
      setShowBanner(false);
      return;
    }

    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    const dismissed = localStorage.getItem('pwa_install_dismissed');
    if (dismissed) {
      const dismissedAt = new Date(dismissed);
      const now = new Date();
      const daysSinceDismissed = (now.getTime() - dismissedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) return;
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    if (iOS) {
      setTimeout(() => setShowBanner(true), 3000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, [isAuthorized]);

  const handleInstall = async () => {
    if (isIOS) {
      setShowInstructions(true);
      return;
    }

    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa_install_dismissed', new Date().toISOString());
  };

  if (!showBanner) return null;

  return (
    <>
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-card border rounded-lg shadow-lg p-4 z-50">
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2 h-6 w-6"
          aria-label="Fechar aviso de instalação"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Smartphone className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Instalar EloLab</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Instale o app para acesso rápido e funcionamento offline
            </p>
            <Button size="sm" className="mt-3 w-full" onClick={handleInstall}>
              <Download className="mr-2 h-4 w-4" />
              Instalar Agora
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instalar no iPhone/iPad</DialogTitle>
            <DialogDescription>
              Siga os passos abaixo para instalar o EloLab:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 w-8 h-8 flex items-center justify-center text-sm font-bold">1</div>
              <p className="text-sm">Toque no botão <strong>Compartilhar</strong> (ícone de quadrado com seta para cima) na barra do Safari</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 w-8 h-8 flex items-center justify-center text-sm font-bold">2</div>
              <p className="text-sm">Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong></p>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 w-8 h-8 flex items-center justify-center text-sm font-bold">3</div>
              <p className="text-sm">Confirme tocando em <strong>"Adicionar"</strong></p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
