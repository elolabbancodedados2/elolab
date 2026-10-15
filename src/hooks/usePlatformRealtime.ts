import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { canalUnico } from '@/lib/realtimeCanal';
import { supabase } from '@/integrations/supabase/client';

const SOURCES = [
  { table: 'clinicas', keys: ['platform-clinicas-overview', 'platform-billing-overview'] },
  { table: 'profiles', keys: ['platform-clinicas-overview', 'platform-billing-overview'] },
  { table: 'assinaturas_plano', keys: ['platform-clinicas-overview', 'platform-billing-overview', 'platform-financial-history'] },
  { table: 'assinaturas_mercadopago', keys: ['platform-billing-overview'] },
  { table: 'platform_plan_orders', keys: ['platform-billing-overview'] },
  { table: 'platform_subscription_invoices', keys: ['platform-subscription-invoices'] },
  { table: 'platform_subscription_events', keys: ['platform-financial-history'] },
  { table: 'mercadopago_webhook_logs', keys: ['platform-billing-overview'] },
  { table: 'registros_pendentes', keys: ['platform-orfaos'] },
] as const;

/** Refreshes admin views as soon as their source rows change. Queries keep a
 * short polling fallback for browsers that temporarily lose their Realtime socket. */
export function usePlatformRealtime(enabled = true) {
  const queryClient = useQueryClient();
  const { user, isPlatformAdmin } = useSupabaseAuth();

  useEffect(() => {
    if (!enabled || !user || !isPlatformAdmin) return;

    let channel = supabase.channel(canalUnico('platform-admin-realtime'));
    for (const source of SOURCES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: source.table },
        () => {
          for (const queryKey of source.keys) {
            void queryClient.invalidateQueries({ queryKey: [queryKey] });
          }
        },
      );
    }

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, isPlatformAdmin, queryClient, user]);
}
