const RECEPCAO_PATH = /^\/recepcao(?:\?tab=caixa)?$/;

export function getReceptionReturnPath(currentPath: string, routeState: unknown): string {
  if (RECEPCAO_PATH.test(currentPath)) return currentPath;

  if (routeState && typeof routeState === 'object' && 'returnTo' in routeState) {
    const returnTo = (routeState as { returnTo?: unknown }).returnTo;
    if (typeof returnTo === 'string' && RECEPCAO_PATH.test(returnTo)) return returnTo;
  }

  return '/recepcao';
}
