import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface ActionableEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  actionIcon?: LucideIcon;
  secondaryLabel?: string;
  onSecondaryAction?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

export function ActionableEmptyState({
  icon: EmptyIcon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon: ActionIcon,
  secondaryLabel,
  onSecondaryAction,
  className,
}: ActionableEmptyStateProps) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center gap-2 py-10 text-center', className)}>
      {EmptyIcon && (
        <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
          <EmptyIcon className="h-6 w-6" />
        </span>
      )}
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="max-w-lg text-sm text-muted-foreground">{description}</p>
      {(actionLabel && onAction) || (secondaryLabel && onSecondaryAction) ? (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {actionLabel && onAction && (
            <Button onClick={onAction}>
              {ActionIcon && <ActionIcon className="mr-2 h-4 w-4" />}
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && onSecondaryAction && (
            <Button variant="outline" onClick={onSecondaryAction}>{secondaryLabel}</Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
