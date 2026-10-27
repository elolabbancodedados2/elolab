import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { mensagemDeErro } from '@/lib/erros';

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
export function friendlyErrorMessage(
  error: unknown,
  fallback = 'Não conseguimos carregar estas informações agora. Tente novamente em instantes.',
): string {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code === 'string' && /^(2\d{4}|2\d{3}[A-Z0-9]|42501|PGRST)/.test(code)) {
    const traduzida = mensagemDeErro(error);
    // mensagemDeErro devolve o texto cru quando não conhece o código.
    return traduzida === (error as { message?: unknown }).message ? fallback : traduzida;
  }
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
    return 'Você não tem permissão para isso. Fale com o administrador da clínica.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'A operação demorou mais que o esperado. Tente novamente.';
  }
  // shortcut: heuristic "short Portuguese sentence without technical markers" decides if a
  // message was written by us on purpose; upgrade to a typed AppError class if it misfires.
  if (
    raw &&
    raw.length <= 160 &&
    !/error|exception|undefined|null|violates|relation|column|function|fetch|json|status code|pgrst|syntax|constraint|stack|\bat\s|[[\]{}<>]|::|_id\b|\b(the|is|not|invalid|failed|denied|credentials|cannot|unexpected|token)\b/i.test(raw)
  ) {
    return raw;
  }
  return fallback;
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
