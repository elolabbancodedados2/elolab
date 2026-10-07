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
  children?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
  secondaryAction,
  children,
  className,
}: EmptyStateProps) {
  return (
    <Card className={cn("p-8 md:p-12", className)}>
      <div className="flex flex-col items-center justify-center text-center space-y-6">
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <Icon className="h-10 w-10 text-primary" />
          </div>
          <div className="absolute -right-1 -bottom-1 h-6 w-6 rounded-full bg-muted flex items-center justify-center">
            <span className="text-sm">✨</span>
          </div>
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-xl font-semibold font-display">{title}</h2>
          <p className="text-muted-foreground">{description}</p>
        </div>
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
