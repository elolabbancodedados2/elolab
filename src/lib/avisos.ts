import type { ReactNode } from 'react';
import { toast } from 'sonner';

export interface Aviso {
  title: ReactNode;
  description?: ReactNode;
  /** 'destructive' vira toast de erro; o padrão é um aviso neutro. */
  variant?: 'default' | 'destructive';
  duration?: number;
}

/**
 * Aviso no formato do antigo `useToast` (Radix), exibido pelo Sonner, que é o
 * único sistema de toasts do app. Facilita migrar telas que montavam
 * `{ title, description, variant }` sem mudar cada chamada.
 */
export function avisar({ title, description, variant, duration }: Aviso) {
  const opcoes = { description, duration };
  return variant === 'destructive' ? toast.error(title, opcoes) : toast(title, opcoes);
}
