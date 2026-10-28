import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { canalUnico } from '@/lib/realtimeCanal';
import { filtroSomenteLegado, instalarCompatibilidadeTabelas, queryKeys } from '@/lib/queryKeys';

const CRITICAL_TABLES = [
  { table: 'agendamentos', queryKeys: ['agendamentos'] },
  { table: 'fila_atendimento', queryKeys: ['fila_atendimento'] },
  { table: 'pacientes', queryKeys: ['pacientes'] },
  { table: 'estoque', queryKeys: ['estoque'] },
  { table: 'lancamentos', queryKeys: ['lancamentos'] },
  { table: 'notification_queue', queryKeys: ['notifications'] },
  // Tarefas alimentam três caches distintos: lista, fila pessoal e contador do dashboard.
  { table: 'tarefas', queryKeys: ['tarefas', 'minha-fila-tarefas', 'minhas-tarefas-pendentes', 'central-notificacoes'] },
] as const;

/**
 * Invalida cada chave em dois formatos: as consultas genéricas da clínica
 * atual (`queryKeys.tabela`, primeiro segmento `clinica_id`) e as chaves
 * legadas `[chave, ...]` dos hooks que ainda não migraram para a fábrica.
 */
export function invalidarChavesDaClinica(
  queryClient: QueryClient,
  clinicaId: string | null | undefined,
  chaves: readonly string[],
) {
  chaves.forEach((chave) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.tabela.todos(clinicaId, chave) });
    void queryClient.invalidateQueries(filtroSomenteLegado(chave));
  });
}

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
  const { user, profile } = useSupabaseAuth();
  instalarCompatibilidadeTabelas(queryClient);
  // Em ref para que a troca de clínica não recrie o canal.
  const clinicaIdRef = useRef<string | null>(profile?.clinica_id ?? null);
  clinicaIdRef.current = profile?.clinica_id ?? null;
  const pollIntervalRef = useRef(INITIAL_POLL_INTERVAL);
  const lastRealtimeEventRef = useRef<number>(Date.now());
  const isActiveRef = useRef(true);

  const invalidateAll = useCallback(() => {
    CRITICAL_TABLES.forEach(({ queryKeys: chaves }) => {
      invalidarChavesDaClinica(queryClient, clinicaIdRef.current, chaves);
    });
  }, [queryClient]);

  useEffect(() => {
    if (!user) return;

    isActiveRef.current = true;
    pollIntervalRef.current = INITIAL_POLL_INTERVAL;
    lastRealtimeEventRef.current = Date.now();

    // Primary: Realtime subscription
    let channel = supabase.channel(canalUnico('global-realtime'));

    CRITICAL_TABLES.forEach(({ table, queryKeys: chaves }) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          invalidarChavesDaClinica(queryClient, clinicaIdRef.current, chaves);
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
