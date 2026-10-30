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
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span
            className="relative mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-[1.1rem] bg-primary text-primary-foreground shadow-sm before:absolute before:-right-0.5 before:-top-0.5 before:size-3 before:rounded-full before:border-2 before:border-background before:bg-highlight before:content-[''] [&_svg]:size-[18px]"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-[30px]">
            {title}
          </h1>
          {description && <p className="mt-1 max-w-prose text-sm leading-6 text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
    </header>
  );
}
