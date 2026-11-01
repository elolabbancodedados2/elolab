/**
 * Depois de um deploy, os arquivos JS com hash antigo deixam de existir. Quem
 * estava com o app aberto recebe "Failed to fetch dynamically imported module"
 * ao abrir uma tela carregada sob demanda (lazy). Aqui o app recarrega uma vez
 * sozinho; se a falha voltar logo em seguida, deixa o ErrorBoundary oferecer
 * "Atualizar versão" em vez de entrar em ciclo de recargas.
 */

const CHAVE_RECARGA = 'elolab:recarga-nova-versao';
/** Uma segunda falha dentro desta janela não recarrega de novo. */
const JANELA_SEM_NOVA_RECARGA_MS = 60_000;

const PADRAO_CHUNK = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading (css )?chunk [\w-]+ failed|unable to preload css|dynamically imported module/i;

export function ehErroDeVersao(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: unknown; message?: unknown };
  if (e.name === 'ChunkLoadError') return true;
  const mensagem = typeof e.message === 'string' ? e.message : typeof error === 'string' ? error : '';
  return PADRAO_CHUNK.test(mensagem);
}

function lerStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * Recarrega a página se ainda não houve recarga recente nesta aba.
 * Devolve `true` quando a recarga foi disparada.
 */
export function recarregarUmaVez(
  recarregar: () => void = () => window.location.reload(),
  agora: number = Date.now(),
): boolean {
  const storage = lerStorage();
  if (!storage) return false;
  try {
    const anterior = Number(storage.getItem(CHAVE_RECARGA) || 0);
    if (anterior && agora - anterior < JANELA_SEM_NOVA_RECARGA_MS) return false;
    storage.setItem(CHAVE_RECARGA, String(agora));
  } catch {
    return false;
  }
  recarregar();
  return true;
}

/** Usado pelo botão "Atualizar versão": força uma recarga explícita. */
export function atualizarVersaoAgora(recarregar: () => void = () => window.location.reload()) {
  const storage = lerStorage();
  try {
    storage?.removeItem(CHAVE_RECARGA);
  } catch { /* storage indisponível */ }
  recarregar();
}

let instalado = false;

/** Registra o listener `vite:preloadError` (uma vez por carregamento). */
export function instalarRecargaPorNovaVersao(alvo: Window = window) {
  if (instalado) return;
  instalado = true;
  alvo.addEventListener('vite:preloadError', (event) => {
    // preventDefault impede o Vite de relançar o erro; só faz sentido quando a
    // página vai mesmo recarregar. Caso contrário o erro segue para o
    // ErrorBoundary, que oferece "Atualizar versão".
    if (recarregarUmaVez()) event.preventDefault();
  });
}
