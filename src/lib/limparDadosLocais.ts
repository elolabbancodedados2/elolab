import { limparAuditoriaPendente } from '@/lib/auditTrail';

/**
 * Prefixos de chaves do navegador com dados da sessão de trabalho de alguém.
 * Em computador compartilhado (recepção), o próximo turno não pode herdar:
 * - `caixa_estado_*`: abertura/fechamento de caixa (Recepção, Abrir/Fechar caixa);
 * - `elolab_abas_v1_*`: telas abertas, com URLs que podem citar pacientes;
 * - `elolab:sessao:*`: relógio de inatividade compartilhado entre abas.
 * Preferências pessoais (tema, densidade, menu lateral) ficam: não são dados
 * clínicos e a pessoa espera reencontrá-las.
 */
export const PREFIXOS_DADOS_DO_USUARIO = ['caixa_estado_', 'elolab_abas_v1_', 'elolab:sessao:'] as const;

function limparStorage(storage: Storage | undefined) {
  if (!storage) return;
  try {
    Object.keys(storage)
      .filter(chave => PREFIXOS_DADOS_DO_USUARIO.some(prefixo => chave.startsWith(prefixo)))
      .forEach(chave => storage.removeItem(chave));
  } catch { /* storage indisponível neste contexto */ }
}

/**
 * Remove do navegador qualquer resposta de API/arquivo que o service worker
 * do PWA tenha guardado. Sem isso, dados clínicos continuavam recuperáveis
 * no Cache Storage depois do logout em computadores compartilhados.
 */
async function limparCachesClinicos() {
  if (typeof caches === 'undefined') return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.includes('supabase') || k.includes('images-cache'))
        .map(k => caches.delete(k)),
    );
  } catch (error) {
    console.error('Error clearing caches:', error);
  }
}

/**
 * Ponto único de limpeza local ao sair: chamado pelo signOut e também quando
 * o Supabase avisa SIGNED_OUT vindo de fora (outra aba, sessão revogada,
 * token expirado sem renovação).
 */
export async function limparDadosLocaisDoUsuario() {
  try { limparAuditoriaPendente(); } catch { /* fila já vazia ou indisponível */ }
  const obter = (tipo: 'localStorage' | 'sessionStorage') => {
    try { return typeof window !== 'undefined' ? window[tipo] : undefined; } catch { return undefined; }
  };
  limparStorage(obter('localStorage'));
  limparStorage(obter('sessionStorage'));
  await limparCachesClinicos();
}
