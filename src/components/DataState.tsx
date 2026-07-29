import { ReactNode } from 'react';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/ui/loading-skeleton';

interface DataStateProps {
  isLoading?: boolean;
  error?: unknown;
  isEmpty?: boolean;
  /** Skeleton exibido enquanto os dados chegam. Default: lista. */
  skeleton?: ReactNode;
  /** Conteúdo exibido quando não há registros. */
  empty?: ReactNode;
  onRetry?: () => void;
  errorTitle?: string;
  children: ReactNode;
}

/**
 * Envolve qualquer bloco de dados garantindo os 4 estados:
 * carregando (skeleton), erro (mensagem amigável + retry), vazio e conteúdo.
 * Nunca deixa a tela em branco.
 */
export function DataState({
  isLoading,
  error,
  isEmpty,
  skeleton,
  empty,
  onRetry,
  errorTitle,
  children,
}: DataStateProps) {
  if (isLoading) {
    return <div className="animate-fade-in">{skeleton ?? <ListSkeleton items={4} />}</div>;
  }

  if (error) {
    return <ErrorState title={errorTitle} error={error} onRetry={onRetry} />;
  }

  if (isEmpty && empty) {
    return <div className="animate-fade-in">{empty}</div>;
  }

  return <>{children}</>;
}