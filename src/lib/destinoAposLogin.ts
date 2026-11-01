/**
 * Página para onde levar a pessoa depois do login. A rota protegida guarda a
 * página pedida em `state.from`; aqui ela só é aceita se for um caminho
 * interno do app (começa com uma única "/" e não é a própria tela de login),
 * para nunca virar redirecionamento aberto para outro site.
 */
export function destinoAposLogin(from: unknown, padrao = '/dashboard'): string {
  let caminho: string | null = null;
  if (typeof from === 'string') {
    caminho = from;
  } else if (from && typeof from === 'object' && typeof (from as { pathname?: unknown }).pathname === 'string') {
    const { pathname, search, hash } = from as { pathname: string; search?: unknown; hash?: unknown };
    caminho = `${pathname}${typeof search === 'string' ? search : ''}${typeof hash === 'string' ? hash : ''}`;
  }
  if (!caminho) return padrao;
  if (!caminho.startsWith('/') || caminho.startsWith('//') || caminho.includes('\\')) return padrao;
  if ([...caminho].some(caractere => caractere.charCodeAt(0) < 0x20)) return padrao;
  const pathname = caminho.split(/[?#]/)[0];
  if (pathname === '/auth' || pathname.startsWith('/auth/') || pathname === '/login' || pathname === '/') return padrao;
  return caminho;
}

/** Estado de navega??o da p?gina pedida (ex.: returnTo da lista), para n?o perd?-lo no retorno ap?s o login. */
export function estadoAposLogin(from: unknown): unknown {
  if (from && typeof from === 'object' && 'state' in from) return (from as { state?: unknown }).state ?? undefined;
  return undefined;
}
