import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export interface OpcoesConfirmacao {
  titulo: string;
  descricao: string;
  confirmar?: string;
  variante?: 'default' | 'destructive' | 'warning';
}

/**
 * Substitui o `confirm()` nativo pelo diálogo do app: `await confirmar({...})`
 * devolve true ou false. Renderize `dialogo` uma vez no componente.
 */
export function useConfirmacao(): [(opcoes: OpcoesConfirmacao) => Promise<boolean>, ReactNode] {
  const [opcoes, setOpcoes] = useState<OpcoesConfirmacao | null>(null);
  const resolver = useRef<((valor: boolean) => void) | null>(null);

  const confirmar = useCallback((novas: OpcoesConfirmacao) => new Promise<boolean>((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setOpcoes(novas);
  }), []);

  const fechar = (valor: boolean) => {
    resolver.current?.(valor);
    resolver.current = null;
    setOpcoes(null);
  };

  const dialogo = (
    <ConfirmDialog
      open={Boolean(opcoes)}
      onOpenChange={(aberto) => { if (!aberto) fechar(false); }}
      title={opcoes?.titulo ?? ''}
      description={opcoes?.descricao ?? ''}
      confirmLabel={opcoes?.confirmar ?? 'Confirmar'}
      variant={opcoes?.variante ?? 'destructive'}
      onConfirm={() => fechar(true)}
    />
  );

  return [confirmar, dialogo];
}
