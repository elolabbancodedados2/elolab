import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, icon, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && (
          <span
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground [&_svg]:size-4"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-[-0.02em] text-foreground sm:text-2xl">
            {title}
          </h1>
          {description && <p className="mt-0.5 max-w-prose text-sm leading-5 text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
    </header>
  );
}
