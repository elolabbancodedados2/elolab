/**
 * Confere qual Supabase o app em `--mode test` realmente usa (CLIN-QA-564).
 *
 * Lê o módulo `src/integrations/supabase/client.ts` servido pelo Vite. Em dev,
 * o Vite injeta `import.meta.env = {...};` no começo do módulo. Nenhum valor de
 * chave é impresso: só se ela é a sintética, se é igual à `QA_SUPABASE_ANON_KEY`
 * ou se é outra.
 *
 * Saída: 0 quando o app já usa a chave do QA (a correção na raiz chegou e a
 * ponte vira no-op); 2 quando usa a chave sintética ou outra (a ponte de
 * `ponteSupabaseApp.ts` continua necessária); 1 em erro.
 *
 * Uso: node scripts/qa/conferir-chave-app-teste.mjs [http://127.0.0.1:4173]
 */
import type { Ambiente } from './duasClinicas.ts';

export const CHAVE_SINTETICA = 'synthetic-local-test-key';
export const MODULO_CLIENTE = '/src/integrations/supabase/client.ts';

export type EstadoChave = 'qa' | 'sintetica' | 'outra' | 'ausente';

export interface Analise {
  url: string | null;
  modo: string | null;
  chave: EstadoChave;
}

export function analisarModuloCliente(codigo: string, anonKeyQa?: string): Analise {
  const m = /import\.meta\.env\s*=\s*(\{[^;]*\});/.exec(codigo);
  if (!m) throw new Error('O módulo não traz o import.meta.env injetado pelo Vite (o servidor é o Vite em dev?).');
  const env = JSON.parse(m[1]) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const chave = texto(env.VITE_SUPABASE_PUBLISHABLE_KEY) ?? texto(env.VITE_SUPABASE_ANON_KEY);
  let estado: EstadoChave = 'ausente';
  if (chave === CHAVE_SINTETICA) estado = 'sintetica';
  else if (chave && anonKeyQa && chave === anonKeyQa.trim()) estado = 'qa';
  else if (chave) estado = 'outra';
  return { url: texto(env.VITE_SUPABASE_URL), modo: texto(env.MODE), chave: estado };
}

export async function executarConferencia(
  argv: readonly string[],
  env: Ambiente = process.env,
  log: (linha: string) => void = console.log,
): Promise<number> {
  const base = argv[0] || `http://127.0.0.1:${env.PLAYWRIGHT_PORT || 4173}`;
  let alvo: URL;
  try {
    alvo = new URL(MODULO_CLIENTE, base);
  } catch {
    log(`URL inválida: ${base}`);
    return 1;
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(alvo.hostname)) {
    log('Só confiro um app local (loopback).');
    return 1;
  }
  try {
    const resposta = await fetch(alvo);
    if (!resposta.ok) {
      log(`O servidor respondeu ${resposta.status} para ${alvo.pathname}.`);
      return 1;
    }
    const a = analisarModuloCliente(await resposta.text(), env.QA_SUPABASE_ANON_KEY);
    log(`Modo: ${a.modo ?? 'desconhecido'}. URL do Supabase no app: ${a.url ?? 'ausente'}.`);
    const descricao: Record<EstadoChave, string> = {
      qa: 'igual à QA_SUPABASE_ANON_KEY. A ponte de tests/fixtures/ponteSupabaseApp.ts vira no-op.',
      sintetica: `sintética (${CHAVE_SINTETICA}). CLIN-QA-564 continua na raiz; a ponte é necessária.`,
      outra: 'diferente da sintética e da QA_SUPABASE_ANON_KEY. A ponte é necessária.',
      ausente: 'ausente no módulo.',
    };
    log(`Chave do app: ${descricao[a.chave]}`);
    return a.chave === 'qa' ? 0 : 2;
  } catch (erro) {
    log(`Falha ao ler o app: ${erro instanceof Error ? erro.message : 'erro desconhecido'}`);
    return 1;
  }
}
