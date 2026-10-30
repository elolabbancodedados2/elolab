import { type RefObject, useCallback, useRef } from 'react';
import { type Location, useBeforeUnload, useBlocker } from 'react-router-dom';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

/** Keeps sensitive drafts in memory and protects both app navigation and reload. */
export function UnsavedChangesGuard({ dirty, busy = false, completed, allowNavigation }: {
  dirty: boolean;
  busy?: boolean;
  completed: RefObject<boolean>;
  allowNavigation?: (current: Pick<Location, 'pathname' | 'search'>, next: Pick<Location, 'pathname' | 'search'>) => boolean;
}) {
  const discarding = useRef(false);
  const shouldBlock = useCallback(() => (dirty || busy) && !completed.current && !discarding.current, [dirty, busy, completed]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    !allowNavigation?.(currentLocation, nextLocation) && shouldBlock()
  );
  useBeforeUnload(useCallback((event: BeforeUnloadEvent) => {
    if (!shouldBlock()) return;
    event.preventDefault();
    event.returnValue = '';
  }, [shouldBlock]));

  return <AlertDialog open={blocker.state === 'blocked'} onOpenChange={open => { if (!open && blocker.state === 'blocked' && !discarding.current) blocker.reset(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{busy ? 'Aguarde a conclusão' : 'Sair sem salvar?'}</AlertDialogTitle>
        <AlertDialogDescription>{busy ? 'A operação está em andamento. Aguarde a resposta para evitar uma segunda tentativa.' : 'As alterações desta página ainda não foram salvas. Você pode continuar preenchendo ou descartá-las.'}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Continuar nesta página</AlertDialogCancel>
        <AlertDialogAction disabled={busy} onClick={event => {
          event.preventDefault();
          if (blocker.state === 'blocked') {
            discarding.current = true;
            blocker.proceed();
          }
        }}>Descartar e sair</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
