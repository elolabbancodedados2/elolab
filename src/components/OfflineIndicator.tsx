import { WifiOff, Wifi } from 'lucide-react';
import { TEXTO_CONEXAO, useConexao } from '@/hooks/useConexao';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const { online, reconectado } = useConexao();

  if (online && !reconectado) return null;

  return (
    <div
      className={cn(
        'fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg transition-all duration-300 lg:bottom-10',
        online ? 'bg-foreground text-background' : 'bg-destructive text-destructive-foreground',
      )}
      role={online ? 'status' : 'alert'}
    >
      {online ? (
        <>
          <Wifi aria-hidden="true" className="h-4 w-4 shrink-0" />
          {TEXTO_CONEXAO.reconectado}
        </>
      ) : (
        <>
          <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span><strong className="font-semibold">{TEXTO_CONEXAO.offline}.</strong> {TEXTO_CONEXAO.offlineDetalhe}</span>
        </>
      )}
    </div>
  );
}
