import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { canalUnico } from '@/lib/realtimeCanal';

const CRITICAL_TABLES = [
  { table: 'agendamentos', queryKey: 'agendamentos' },
  { table: 'fila_atendimento', queryKey: 'fila_atendimento' },
  { table: 'pacientes', queryKey: 'pacientes' },
  { table: 'estoque', queryKey: 'estoque' },
  { table: 'lancamentos', queryKey: 'lancamentos' },
  { table: 'notification_queue', queryKey: 'notifications' },
] as const;

const INITIAL_POLL_INTERVAL = 30_000; // 30s
const MAX_POLL_INTERVAL = 120_000;    // 2min
const BACKOFF_FACTOR = 1.5;

/**
 * Subscribes to real-time changes on critical tables and invalidates
 * React Query caches automatically. Includes a fallback polling mechanism
 * with exponential backoff for resilience when Realtime fails silently.
 */
export function useRealtimeSubscription() {
  const queryClient = useQueryClient();
  const { user } = useSupabaseAuth();
  const pollIntervalRef = useRef(INITIAL_POLL_INTERVAL);
  const lastRealtimeEventRef = useRef<number>(Date.now());
  const isActiveRef = useRef(true);

  const invalidateAll = useCallback(() => {
    CRITICAL_TABLES.forEach(({ queryKey }) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    });
  }, [queryClient]);

  useEffect(() => {
    if (!user) return;

    isActiveRef.current = true;
    pollIntervalRef.current = INITIAL_POLL_INTERVAL;
    lastRealtimeEventRef.current = Date.now();

    // Primary: Realtime subscription
    let channel = supabase.channel(canalUnico('global-realtime'));

    CRITICAL_TABLES.forEach(({ table, queryKey }) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          queryClient.invalidateQueries({ queryKey: [queryKey] });
          lastRealtimeEventRef.current = Date.now();
          pollIntervalRef.current = INITIAL_POLL_INTERVAL; // reset backoff
        }
      );
    });

    let channelErrorLogged = false;
    channel.subscribe((status) => {
      if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !channelErrorLogged) {
        console.warn('[Realtime] Canal com problema, usando polling como fallback.');
        channelErrorLogged = true;
      }
    });

    // Fallback: polling with exponential backoff
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = () => {
      if (!isActiveRef.current) return;

      const timeSinceLastEvent = Date.now() - lastRealtimeEventRef.current;

      // Only poll if we haven't received a realtime event recently
      if (timeSinceLastEvent > INITIAL_POLL_INTERVAL) {
        invalidateAll();
        // Increase interval with backoff since realtime seems inactive
        pollIntervalRef.current = Math.min(
          pollIntervalRef.current * BACKOFF_FACTOR,
          MAX_POLL_INTERVAL
        );
      } else {
        // Realtime is working, reset backoff
        pollIntervalRef.current = INITIAL_POLL_INTERVAL;
      }

      if (isActiveRef.current) {
        timeoutId = setTimeout(poll, pollIntervalRef.current);
      }
    };

    timeoutId = setTimeout(poll, INITIAL_POLL_INTERVAL);

    return () => {
      isActiveRef.current = false;
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [user, queryClient, invalidateAll]);
}
