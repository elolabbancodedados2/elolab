import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { usePushNotifications } from './usePushNotifications';

/**
 * Listens to Supabase Realtime events on critical tables and fires
 * native browser notifications for important changes.
 */
export function useRealtimePushNotifications() {
  const { user, profile } = useSupabaseAuth();
  const { permission, sendLocalNotification } = usePushNotifications();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!user?.id || !profile?.clinica_id) return;
    let active = true;
    void (supabase as any).from('user_preferences').select('browser_notifications')
      .eq('user_id', user.id).eq('clinica_id', profile.clinica_id).maybeSingle()
      .then(({ data }: { data: { browser_notifications?: boolean } | null }) => {
        if (active) setEnabled(data?.browser_notifications !== false);
      });
    return () => { active = false; };
  }, [user?.id, profile?.clinica_id]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ browser_notifications?: boolean }>).detail;
      if (detail) setEnabled(detail.browser_notifications !== false);
    };
    window.addEventListener('elolab:preferences-changed', onChange);
    return () => window.removeEventListener('elolab:preferences-changed', onChange);
  }, []);

  useEffect(() => {
    if (!user || !enabled || permission !== 'granted') return;

    const channel = supabase
      .channel('push-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agendamentos' },
        (payload) => {
          const ag = payload.new as Record<string, unknown>;
          sendLocalNotification('📅 Novo Agendamento', {
            body: `Nova consulta agendada para ${ag.data} às ${(ag.hora_inicio as string)?.slice(0, 5)}`,
            tag: `agendamento-${ag.id}`,
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'agendamentos' },
        (payload) => {
          const ag = payload.new as Record<string, unknown>;
          const old = payload.old as Record<string, unknown>;
          if (ag.status !== old.status) {
            const statusLabels: Record<string, string> = {
              confirmado: '✅ Consulta Confirmada',
              cancelado: '❌ Consulta Cancelada',
              finalizado: '🏁 Consulta Finalizada',
              faltou: '⚠️ Paciente Faltou',
            };
            const title = statusLabels[ag.status as string] || '📋 Atualização de Consulta';
            sendLocalNotification(title, {
              body: `Status atualizado para: ${ag.status}`,
              tag: `agendamento-update-${ag.id}`,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fila_atendimento' },
        (payload) => {
          const fila = payload.new as Record<string, unknown>;
          if (fila.prioridade === 'urgente' || fila.prioridade === 'emergencia') {
            sendLocalNotification('🚨 Paciente Prioritário na Fila', {
              body: `Paciente com prioridade ${fila.prioridade} entrou na fila`,
              tag: `fila-urgente-${fila.id}`,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'estoque' },
        (payload) => {
          const item = payload.new as Record<string, unknown>;
          const quantidade = Number(item.quantidade);
          const minimo = Number(item.quantidade_minima) || 0;
          if (quantidade <= minimo && quantidade > 0) {
            sendLocalNotification('⚠️ Estoque Baixo', {
              body: `"${item.nome}" está com apenas ${quantidade} unidade(s) (mínimo: ${minimo})`,
              tag: `estoque-baixo-${item.id}`,
            });
          } else if (quantidade === 0) {
            sendLocalNotification('🔴 Estoque Zerado', {
              body: `"${item.nome}" está com estoque zerado!`,
              tag: `estoque-zero-${item.id}`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, permission, sendLocalNotification, enabled]);
}
