import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      toast.error('Este navegador não suporta notificações push');
      return false;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    
    if (result === 'granted') {
      toast.success('Notificações ativadas!');
      return true;
    } else {
      toast.error('Permissão de notificação negada');
      return false;
    }
  };

  const sendLocalNotification = (title: string, options?: NotificationOptions) => {
    if (permission !== 'granted') {
      console.warn('Permissão de notificação não concedida');
      return;
    }

    new Notification(title, {
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      ...options,
    });
  };

  const scheduleNotification = (title: string, options: NotificationOptions & { delay: number }) => {
    const { delay, ...notificationOptions } = options;
    
    setTimeout(() => {
      sendLocalNotification(title, notificationOptions);
    }, delay);
  };

  return {
    permission,
    isSupported: 'Notification' in window,
    requestPermission,
    sendLocalNotification,
    scheduleNotification,
  };
}
