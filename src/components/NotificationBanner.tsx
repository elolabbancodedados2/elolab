import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/hooks/useNotifications';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export function NotificationBanner() {
  const { permission, supported, requestPermission } = useNotifications();
  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [localDismissed, setLocalDismissed] = useState(false);

  const { data: dismissed = false } = useQuery({
    queryKey: ['notification-banner-dismissed', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data } = await supabase
        .from('configuracoes_clinica')
        .select('valor')
        .eq('chave', 'notification_banner_dismissed')
        .eq('user_id', user.id)
        .maybeSingle();
      return data?.valor === true;
    },
    enabled: !!user?.id,
  });

  const handleDismiss = async () => {
    setLocalDismissed(true);
    if (user?.id) {
      await supabase.from('configuracoes_clinica').upsert({
        chave: 'notification_banner_dismissed',
        user_id: user.id,
        valor: true as any,
      }, { onConflict: 'user_id,chave' });
      queryClient.invalidateQueries({ queryKey: ['notification-banner-dismissed', user.id] });
    }
  };

  const handleEnable = async () => {
    const granted = await requestPermission();
    if (granted) {
      handleDismiss();
    }
  };

  // Only show for logged-in users, and only once
  if (!user || !supported || permission === 'granted' || permission === 'denied' || dismissed || localDismissed) {
    return null;
  }

  return (
    <div className="border-b border-primary/20 bg-primary/10 px-2 py-1.5 sm:px-4 sm:py-2">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Bell className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
          <p className="min-w-0 text-xs leading-tight sm:text-sm">
            <span className="sm:hidden">Ative os lembretes de consultas</span>
            <span className="hidden sm:inline">Ative as notificações para receber lembretes de consultas</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button size="sm" className="h-11 px-3 sm:h-9" onClick={handleEnable}>
            Ativar
          </Button>
          <Button size="icon" variant="ghost" className="h-11 w-11 sm:h-9 sm:w-9" aria-label="Dispensar aviso de notificações" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
