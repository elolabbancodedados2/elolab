import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline && !showReconnected) return null;

  return (
    <div
      className={`fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg transition-all duration-300 lg:bottom-4 ${
        isOffline
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-emerald-600 text-white'
      }`}
      role="alert"
    >
      {isOffline ? (
        <>
          <WifiOff className="h-4 w-4" />
          Sem conexão — dados em cache disponíveis
        </>
      ) : (
        <>
          <Wifi className="h-4 w-4" />
          Conexão restaurada
        </>
      )}
    </div>
  );
}
