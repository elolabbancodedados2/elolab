import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { mensagemConhecidaDeErro } from '@/lib/erros';

interface ErrorStateProps {
  title?: string;
  description?: string;
  error?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  compact?: boolean;
}

export const MENSAGEM_CARREGAMENTO_GENERICA = 'Não conseguimos carregar estas informações agora. Tente novamente em instantes.';

/**
 * Traduz erros de carregamento em mensagens que o usuário da clínica entende.
 * Usa a mesma tradução de `mensagemDeErro` (src/lib/erros.ts) para os erros
 * reconhecidos; para os demais mantém o texto genérico de carregamento, sem
 * expor mensagens técnicas do servidor.
 */
export function friendlyErrorMessage(error: unknown): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  }
  return mensagemConhecidaDeErro(error) ?? MENSAGEM_CARREGAMENTO_GENERICA;
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
        <Icon aria-hidden="true" className="h-5 w-5 text-destructive shrink-0" />
        <p className="text-sm text-foreground flex-1">{message}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0">
            <RefreshCw aria-hidden="true" className="h-4 w-4 mr-2" />
            {retryLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card role="alert" className={cn('p-8 md:p-12 animate-fade-in', className)}>
      <div className="flex flex-col items-center justify-center text-center space-y-5">
        <div className="h-16 w-16 rounded-2xl bg-destructive/10 ring-1 ring-destructive/15 shadow-sm flex items-center justify-center">
          <Icon aria-hidden="true" className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-lg font-semibold font-display">{title}</h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        {onRetry && (
          <Button onClick={onRetry}>
            <RefreshCw aria-hidden="true" className="h-4 w-4 mr-2" />
            {retryLabel}
          </Button>
        )}
      </div>
    </Card>
  );
}
