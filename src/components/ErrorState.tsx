import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  description?: string;
  error?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  compact?: boolean;
}

/** Traduz erros técnicos em mensagens que o usuário da clínica entende. */
export function friendlyErrorMessage(error: unknown): string {
  const raw =
    typeof error === 'string'
      ? error
      : (error as { message?: string } | undefined)?.message || '';
  const msg = raw.toLowerCase();

  if (!navigator.onLine || msg.includes('failed to fetch') || msg.includes('networkerror')) {
    return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
  }
  if (msg.includes('jwt') || msg.includes('not authenticated') || msg.includes('401')) {
    return 'Sua sessão expirou. Entre novamente para continuar.';
  }
  if (msg.includes('permission') || msg.includes('row-level security') || msg.includes('403')) {
    return 'Você não tem permissão para ver estas informações.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'A consulta demorou mais que o esperado. Tente novamente.';
  }
  return 'Não conseguimos carregar estas informações agora. Tente novamente em instantes.';
}

export function ErrorState({
  title = 'Algo deu errado',
  description,
  error,
  onRetry,
  retryLabel = 'Tentar novamente',
  className,
  compact = false,
}: ErrorStateProps) {
  const message = description ?? friendlyErrorMessage(error);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const Icon = offline ? WifiOff : AlertTriangle;

  if (compact) {
    return (
      <div
        role="alert"
        className={cn(
          'flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 animate-fade-in',
          className
        )}
      >
        <Icon className="h-5 w-5 text-destructive shrink-0" />
        <p className="text-sm text-foreground flex-1">{message}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0">
            <RefreshCw className="h-4 w-4 mr-2" />
            {retryLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card role="alert" className={cn('p-8 md:p-12 animate-fade-in', className)}>
      <div className="flex flex-col items-center justify-center text-center space-y-5">
        <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <Icon className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-lg font-semibold font-display">{title}</h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        {onRetry && (
          <Button onClick={onRetry} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            {retryLabel}
          </Button>
        )}
      </div>
    </Card>
  );
}