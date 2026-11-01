import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { EstadoInatividade } from '@/hooks/useSessionTimeout';

interface Props extends EstadoInatividade {
  onSair: () => void;
}

function formatarContagem(segundos: number) {
  const total = Math.max(0, segundos);
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${min}:${String(seg).padStart(2, '0')}`;
}

/** Aviso de expiração por inatividade, com contagem regressiva. */
export function SessionTimeoutDialog({ avisoAberto, segundosRestantes, continuar, onSair }: Props) {
  return (
    <Dialog open={avisoAberto} onOpenChange={(aberto) => { if (!aberto) continuar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-warning/15">
            <Clock aria-hidden="true" className="h-5 w-5 text-warning" />
          </div>
          <DialogTitle>Sua sessão vai expirar</DialogTitle>
          <DialogDescription>
            Por segurança, a sessão é encerrada depois de um tempo sem uso. Ela termina em{' '}
            <span className="font-semibold tabular-nums text-foreground" aria-live="off">{formatarContagem(segundosRestantes)}</span>.
          </DialogDescription>
        </DialogHeader>
        <p className="sr-only" aria-live="polite">
          {segundosRestantes > 0 && segundosRestantes % 60 === 0 ? `Faltam ${segundosRestantes / 60} minutos.` : ''}
        </p>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onSair}>Sair agora</Button>
          <Button onClick={continuar} autoFocus>Continuar conectado</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
