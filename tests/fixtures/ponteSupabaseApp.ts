/**
 * Ponte entre o app em `--mode test` e o Supabase local das suítes de segurança.
 *
 * CLIN-QA-564: em `--mode test`, `vite.config.ts` injeta
 * `createViteTestSupabaseDefine({})`. Assim, o bundle sempre aponta para
 * `http://127.0.0.1:54321` com a chave sintética `synthetic-local-test-key`
 * e ignora `QA_SUPABASE_*` (ver `scripts/test-supabase-env.ts`). O Kong do
 * Supabase local recusa essa chave, e a interface do RBAC e o portal não
 * carregam nada.
 *
 * Sem alterar a configuração do produto, a ponte intercepta no navegador do
 * Playwright as requisições HTTP do app para o Supabase e:
 * - troca o cabeçalho `apikey` pela `QA_SUPABASE_ANON_KEY`;
 * - troca `Authorization: Bearer <chave antiga>` pela mesma chave. O JWT de
 *   uma sessão de usuário é mantido como está;
 * - troca a origem quando `QA_SUPABASE_URL` não é a mesma do bundle, por
 *   exemplo `localhost` em vez de `127.0.0.1`.
 *
 * O WebSocket do Realtime não passa pela ponte, porque o Playwright não deixa
 * trocar a URL de um WebSocket já aberto. Nenhuma suíte de segurança depende do
 * Realtime. Quando a configuração do Vite passar a ler `QA_SUPABASE_*`, a
 * ponte vira no-op: a chave do app já será a do QA. Para conferir isso, use
 * `node scripts/qa/conferir-chave-app-teste.mjs`.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { DEFAULT_LOCAL_SUPABASE_URL, resolveLocalQaSupabaseConfig } from '../../scripts/test-supabase-env.ts';
import type { Ambiente } from './duasClinicas.ts';

export interface PonteSupabase {
  /** Origem que o bundle do app usa (o que o navegador realmente chama). */
  appOrigin: string;
  /** Origem do Supabase local do QA. */
  qaOrigin: string;
  /** Chave anon do Supabase local do QA. */
  anonKey: string;
  /** Chave do `localStorage` em que o supabase-js do app guarda a sessão. */
  chaveSessao: string;
}

const HOSTS_LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function origemLoopback(valor: string, nome: string): URL {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(`${nome} não é uma URL válida.`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || !HOSTS_LOOPBACK.has(url.hostname)) {
    throw new Error(`${nome} precisa ser loopback (localhost, 127.0.0.1 ou [::1]).`);
  }
  return url;
}

/** Mesma regra do supabase-js 2.x: `sb-<primeiro rótulo do host>-auth-token`. */
export function chaveSessaoSupabase(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

/**
 * Monta a ponte a partir do ambiente. Devolve `null` quando o Supabase do QA
 * não está configurado; quem chama decide se isso é skip ou falha.
 * `QA_APP_SUPABASE_URL` só é preciso se o bundle usar outra URL que não a
 * padrão do modo de teste.
 */
export function configurarPonte(env: Ambiente = process.env): PonteSupabase | null {
  const qa = resolveLocalQaSupabaseConfig(env);
  if (!qa) return null;
  const app = origemLoopback(env.QA_APP_SUPABASE_URL?.trim() || DEFAULT_LOCAL_SUPABASE_URL, 'QA_APP_SUPABASE_URL');
  const destino = origemLoopback(qa.url, 'QA_SUPABASE_URL');
  if (app.protocol !== destino.protocol) {
    // O Playwright só reescreve URL mantendo o protocolo.
    throw new Error('QA_SUPABASE_URL e a URL do app precisam usar o mesmo protocolo.');
  }
  return {
    appOrigin: app.origin,
    qaOrigin: destino.origin,
    anonKey: qa.anonKey,
    chaveSessao: chaveSessaoSupabase(app.href),
  };
}

/** Cabeçalhos com nomes em minúsculas, como `request.headers()` devolve. */
export function reescreverCabecalhos(
  headers: Readonly<Record<string, string>>,
  anonKey: string,
): Record<string, string> {
  const saida = { ...headers };
  const antiga = saida.apikey;
  if (antiga === undefined) return saida;
  saida.apikey = anonKey;
  // Sem sessão, o supabase-js manda a própria chave como Bearer. Com sessão,
  // manda o JWT do usuário, que não pode ser trocado.
  if (saida.authorization === `Bearer ${antiga}`) saida.authorization = `Bearer ${anonKey}`;
  return saida;
}

/** Troca a origem do app pela do QA e o `apikey` de query string, se houver. */
export function reescreverUrl(url: string, ponte: Pick<PonteSupabase, 'appOrigin' | 'qaOrigin' | 'anonKey'>): string {
  const alvo = new URL(url);
  if (alvo.origin !== ponte.appOrigin) return url;
  const destino = new URL(ponte.qaOrigin);
  alvo.protocol = destino.protocol;
  alvo.host = destino.host;
  if (alvo.searchParams.has('apikey')) alvo.searchParams.set('apikey', ponte.anonKey);
  return alvo.toString();
}

/** Liga a ponte numa página ou num contexto. Chame antes do primeiro `goto`. */
export async function instalarPonteSupabase(alvo: Page | BrowserContext, ponte: PonteSupabase): Promise<void> {
  await alvo.route(
    (url) => url.origin === ponte.appOrigin,
    async (route) => {
      const req = route.request();
      await route.continue({
        url: reescreverUrl(req.url(), ponte),
        headers: reescreverCabecalhos(req.headers(), ponte.anonKey),
      });
    },
  );
}
