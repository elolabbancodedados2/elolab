import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LucideIcon, FileQuestion, Users, Package, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Sugestões curtas do que o usuário pode fazer nesta tela. */
  tips?: string[];
  children?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
  secondaryAction,
  tips,
  children,
  className,
}: EmptyStateProps) {
  return (
    <Card className={cn("relative overflow-hidden border-dashed p-8 md:p-12", className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-highlight/15 blur-3xl"
      />
      <div className="relative flex flex-col items-center justify-center text-center space-y-6">
        <div className="relative">
          <div className="h-20 w-20 rounded-3xl bg-[image:var(--gradient-primary)] shadow-glow flex items-center justify-center rotate-[-4deg]">
            <Icon className="h-9 w-9 text-white rotate-[4deg]" />
          </div>
          <div className="absolute -right-2 -bottom-2 h-7 w-7 rounded-full bg-highlight text-highlight-foreground ring-4 ring-card flex items-center justify-center">
            <span className="text-xs font-black">+</span>
          </div>
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-xl font-semibold font-display">{title}</h2>
          <p className="text-muted-foreground">{description}</p>
        </div>
        {tips && tips.length > 0 && (
          <ul className="grid w-full max-w-lg gap-2 text-left sm:grid-cols-2">
            {tips.map(tip => (
              <li key={tip} className="flex items-start gap-2 rounded-2xl bg-accent/70 px-3 py-2.5 text-sm text-accent-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                {tip}
              </li>
            ))}
          </ul>
        )}
        {(action || secondaryAction || children) && (
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            {action && (
              <Button onClick={action.onClick} size="lg">
                {action.icon && <action.icon className="mr-2 h-4 w-4" />}
                {action.label}
              </Button>
            )}
            {secondaryAction && (
              <Button variant="outline" size="lg" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )}
            {children}
          </div>
        )}
      </div>
    </Card>
  );
}

// Preset empty states for common use cases
export function EmptyPatients({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyState
      icon={Users}
      title="Nenhum paciente cadastrado"
      description="Comece cadastrando seu primeiro paciente para gerenciar consultas e prontuários."
      action={{
        label: 'Cadastrar Paciente',
        onClick: onAdd,
        icon: Users,
      }}
    />
  );
}

export function EmptyEstoque({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyState
      icon={Package}
      title="Estoque vazio"
      description="Nenhum item cadastrado no estoque. Adicione materiais e medicamentos."
      action={{
        label: 'Adicionar Item',
        onClick: onAdd,
        icon: Package,
      }}
    />
  );
}

export function NoResults({ searchTerm }: { searchTerm: string }) {
  return (
    <EmptyState
      icon={SearchX}
      title="Nenhum resultado encontrado"
      description={`Não encontramos resultados para "${searchTerm}". Tente buscar com outros termos.`}
    />
  );
}
