import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { canalUnico } from '@/lib/realtimeCanal';

const CRITICAL_TABLES = [
  { table: 'agendamentos', queryKeys: ['agendamentos'] },
  { table: 'fila_atendimento', queryKeys: ['fila_atendimento'] },
  { table: 'pacientes', queryKeys: ['pacientes'] },
  { table: 'estoque', queryKeys: ['estoque'] },
  { table: 'lancamentos', queryKeys: ['lancamentos'] },
  // 'notification-queue' e 'central-notificacoes' alimentam o sino da Navbar.
  { table: 'notification_queue', queryKeys: ['notifications', 'notification-queue', 'central-notificacoes'] },
  // Tarefas alimentam três caches distintos: lista, fila pessoal e contador do dashboard.
  { table: 'tarefas', queryKeys: ['tarefas', 'minha-fila-tarefas', 'minhas-tarefas-pendentes', 'central-notificacoes'] },
] as const;

export const INITIAL_POLL_INTERVAL = 30_000; // 30s
export const MAX_POLL_INTERVAL = 120_000;    // 2min
const BACKOFF_FACTOR = 1.5;

/**
 * Subscribes to real-time changes on critical tables and invalidates
 * React Query caches automatically.
 *
 * O polling de reserva só roda quando o canal NÃO está inscrito (erro,
 * timeout, fechado ou ainda conectando) e a aba está visível. Antes ele
 * invalidava tudo a cada 30 s sempre que não chegava evento, mesmo com o
 * canal saudável — ou seja, em toda clínica com pouco movimento.
 */
export function useRealtimeSubscription() {
  const queryClient = useQueryClient();
  const { user } = useSupabaseAuth();
  const userId = user?.id;
  const pollIntervalRef = useRef(INITIAL_POLL_INTERVAL);
  const channelStatusRef = useRef<string>('CONNECTING');
  const isActiveRef = useRef(true);

  const invalidateAll = useCallback(() => {
    const keys = new Set<string>(CRITICAL_TABLES.flatMap(({ queryKeys }) => [...queryKeys]));
    // Só as consultas montadas na tela voltam ao servidor; as demais ficam
    // marcadas como desatualizadas e recarregam quando forem usadas.
    keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey: [queryKey], refetchType: 'active' }));
  }, [queryClient]);

  useEffect(() => {
    if (!userId) return;

    isActiveRef.current = true;
    pollIntervalRef.current = INITIAL_POLL_INTERVAL;
    channelStatusRef.current = 'CONNECTING';

    // Primary: Realtime subscription
    let channel = supabase.channel(canalUnico('global-realtime'));

    CRITICAL_TABLES.forEach(({ table, queryKeys }) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          queryKeys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey: [queryKey] }));
        }
      );
    });

    let channelErrorLogged = false;
    channel.subscribe((status) => {
      const anterior = channelStatusRef.current;
      channelStatusRef.current = status;
      if (status === 'SUBSCRIBED') {
        pollIntervalRef.current = INITIAL_POLL_INTERVAL;
        channelErrorLogged = false;
        // Voltou depois de uma queda: pode ter perdido eventos no intervalo.
        if (anterior !== 'CONNECTING' && anterior !== 'SUBSCRIBED') invalidateAll();
      }
      if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !channelErrorLogged) {
        console.warn('[Realtime] Canal com problema, usando polling como fallback.');
        channelErrorLogged = true;
      }
    });

    // Fallback: polling with exponential backoff
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = () => {
      if (!isActiveRef.current) return;

      const canalSaudavel = channelStatusRef.current === 'SUBSCRIBED';
      const abaVisivel = typeof document === 'undefined' || !document.hidden;

      if (!canalSaudavel && abaVisivel) {
        invalidateAll();
        // Increase interval with backoff while realtime stays down
        pollIntervalRef.current = Math.min(
          pollIntervalRef.current * BACKOFF_FACTOR,
          MAX_POLL_INTERVAL
        );
      } else if (canalSaudavel) {
        pollIntervalRef.current = INITIAL_POLL_INTERVAL;
      }

      if (isActiveRef.current) {
        timeoutId = setTimeout(poll, pollIntervalRef.current);
      }
    };

    timeoutId = setTimeout(poll, INITIAL_POLL_INTERVAL);

    // Ao voltar para a aba com o canal fora do ar, atualiza na hora em vez de
    // esperar o próximo ciclo.
    const aoMudarVisibilidade = () => {
      if (document.hidden || channelStatusRef.current === 'SUBSCRIBED') return;
      invalidateAll();
    };
    document.addEventListener('visibilitychange', aoMudarVisibilidade);

    return () => {
      isActiveRef.current = false;
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient, invalidateAll]);
}
