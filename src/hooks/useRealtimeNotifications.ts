import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { canalUnico } from '@/lib/realtimeCanal';

export interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  time: string;
  read: boolean;
  created_at: string;
}

function mapTipoToType(tipo: string): AppNotification['type'] {
  switch (tipo) {
    case 'email': return 'info';
    case 'whatsapp': return 'success';
    case 'sms': return 'info';
    default: return 'info';
  }
}

function mapStatusToType(status: string): AppNotification['type'] {
  switch (status) {
    case 'enviado': return 'success';
    case 'erro': return 'error';
    case 'pendente': return 'warning';
    default: return 'info';
  }
}

export function useRealtimeNotifications() {
  const { user } = useSupabaseAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('notification_queue')
        .select('id, tipo, assunto, conteudo, status, created_at, destinatario_nome')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      const mapped: AppNotification[] = (data || []).map((n) => ({
        id: n.id,
        type: n.status === 'erro' ? 'error' : mapStatusToType(n.status),
        title: n.assunto || `Notificação ${n.tipo}`,
        message: n.conteudo?.substring(0, 100) || '',
        time: formatDistanceToNow(new Date(n.created_at!), { addSuffix: true, locale: ptBR }),
        read: n.status === 'enviado',
        created_at: n.created_at!,
      }));

      setNotifications(mapped);
    } catch (err) {
      console.error('Error in fetchNotifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(canalUnico('notifications-realtime'))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notification_queue' },
        (payload) => {
          const n = payload.new as Record<string, unknown>;
          const newNotification: AppNotification = {
            id: n.id as string,
            type: mapStatusToType(n.status as string),
            title: (n.assunto as string) || `Nova notificação`,
            message: ((n.conteudo as string) || '').substring(0, 100),
            time: 'Agora',
            read: false,
            created_at: n.created_at as string,
          };
          setNotifications((prev) => [newNotification, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    isLoading,
    refetch: fetchNotifications,
  };
}
