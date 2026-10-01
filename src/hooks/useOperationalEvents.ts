import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { queryRootsForOperationalEvent } from '@/lib/operationalEvents';
import { canalUnico } from '@/lib/realtimeCanal';

type OperationalEventRow = { aggregate_type?: string };

export function useOperationalEvents() {
  const { clinicaId } = useSupabaseAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!clinicaId) return;

    const channel = supabase
      .channel(canalUnico(`operational-events:${clinicaId}`))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'operational_events',
          filter: `clinica_id=eq.${clinicaId}`,
        },
        (payload) => {
          const row = payload.new as OperationalEventRow;
          for (const root of queryRootsForOperationalEvent(row.aggregate_type ?? '')) {
            void queryClient.invalidateQueries({ queryKey: [root] });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clinicaId, queryClient]);
}
