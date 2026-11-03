import { useState, useEffect, useCallback } from 'react';

interface NotificationState {
  permission: NotificationPermission;
  supported: boolean;
}

export function useNotifications() {
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

  return {
    ...state,
    requestPermission,
    sendNotification,
  };
}
