import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { format, differenceInMinutes, isToday, parseISO } from 'date-fns';

interface NotificationState {
  permission: NotificationPermission;
  supported: boolean;
}

export function useNotifications() {
  const { user } = useSupabaseAuth();
  const [state, setState] = useState<NotificationState>({
    permission: 'default',
    supported: false,
  });

  useEffect(() => {
    if ('Notification' in window) {
      setState({
        permission: Notification.permission,
        supported: true,
      });
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!state.supported) return false;
    
    try {
      const permission = await Notification.requestPermission();
      setState(prev => ({ ...prev, permission }));
      return permission === 'granted';
    } catch {
      return false;
    }
  }, [state.supported]);

  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (state.permission !== 'granted') return null;
    
    return new Notification(title, {
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      ...options,
    });
  }, [state.permission]);

  const checkUpcomingAppointments = useCallback(async () => {
    if (state.permission !== 'granted' || !user) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    const { data: agendamentos } = await supabase
      .from('agendamentos')
      .select('id, data, hora_inicio, status, paciente_id, pacientes(nome)')
      .eq('data', today)
      .not('status', 'in', '("cancelado","finalizado")');

    if (!agendamentos) return;
    const now = new Date();

    agendamentos.forEach((ag: any) => {
      const appointmentTime = parseISO(`${ag.data}T${ag.hora_inicio}`);
      const minutesUntil = differenceInMinutes(appointmentTime, now);

      if (minutesUntil > 0 && minutesUntil <= 15) {
        const notifiedKey = `notified_${ag.id}_15min`;
        
        if (!sessionStorage.getItem(notifiedKey)) {
          sendNotification('Consulta em breve', {
            body: `${ag.pacientes?.nome || 'Paciente'} às ${ag.hora_inicio}`,
            tag: ag.id,
          });
          sessionStorage.setItem(notifiedKey, 'true');
        }
      }
    });
  }, [state.permission, sendNotification, user]);

  useEffect(() => {
    if (state.permission !== 'granted' || !user) return;
    
    const interval = setInterval(checkUpcomingAppointments, 60000);
    checkUpcomingAppointments();
    
    return () => clearInterval(interval);
  }, [state.permission, checkUpcomingAppointments, user]);

  return {
    ...state,
    requestPermission,
    sendNotification,
    checkUpcomingAppointments,
  };
}
