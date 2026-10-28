/**
 * Portal do paciente nas suítes de segurança (P2 do gate, docs/time/rodada-4/codex-revisor.md).
 *
 * O portal lê pela edge function `patient-portal`. Ela só usa o banco
 * (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, injetadas pelo edge runtime do
 * Supabase local) e não chama integração externa. Por isso não depende do stub
 * de WhatsApp/IA (`QA_EDGE_STUB_CONFIRMED`) e tem variável própria:
 *
 *   QA_PORTAL_EDGE_LOCAL=ELOLAB_LOCAL_PORTAL
 *
 * Significa: "a `patient-portal` deste repositório está servida pelo Supabase
 * LOCAL em QA_SUPABASE_URL". Com ela, os testes do portal rodam e uma sonda
 * confirma que a função responde antes do primeiro teste.
 *
 * Sem ela:
 * - fora do CI, os testes do portal são pulados (máquina sem Docker);
 * - no CI (ou com QA_SECURITY_REQUIRED=1), é FALHA, não skip. O skip não está
 *   na allowlist e o gate o reprovaria de qualquer forma; a falha diz o que
 *   configurar.
 *
 * Conferência isolada (por exemplo, num passo do workflow depois do
 * `supabase start`): `node scripts/qa/conferir-portal-local.mjs`.
 */
import type { Ambiente } from './duasClinicas.ts';
import { suiteObrigatoria } from './suiteSeguranca.ts';

export const VAR_PORTAL_EDGE = 'QA_PORTAL_EDGE_LOCAL';
export const VALOR_PORTAL_EDGE = 'ELOLAB_LOCAL_PORTAL';
export const FUNCAO_PORTAL = 'patient-portal';
/** Token sabidamente inválido: a sonda nunca recebe dado de paciente. */
export const TOKEN_SONDA = 'qa-sonda-portal-token-inexistente';

const HOSTS_LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export function portalEdgeConfirmado(env: Ambiente = process.env): boolean {
  return env[VAR_PORTAL_EDGE]?.trim() === VALOR_PORTAL_EDGE;
}

/**
 * `null` quando o portal deve rodar; mensagem de skip quando a suíte é
 * opcional e a variável falta; lança erro quando a suíte é obrigatória.
 */
export function decidirPortalEdge(env: Ambiente = process.env): string | null {
  if (portalEdgeConfirmado(env)) return null;
  const detalhe =
    `Portal do paciente: defina ${VAR_PORTAL_EDGE}=${VALOR_PORTAL_EDGE} com a edge function ` +
    `${FUNCAO_PORTAL} servida pelo Supabase local (supabase start serve supabase/functions).`;
  if (suiteObrigatoria(env)) {
    throw new Error(`Suíte de segurança obrigatória neste ambiente e sem o portal habilitado. ${detalhe}`);
  }
  return detalhe;
}

/** URL da função no Supabase local; recusa qualquer host fora de loopback. */
export function urlFuncaoPortal(supabaseUrl: string): string {
  let base: URL;
  try {
    base = new URL(supabaseUrl);
  } catch {
    throw new Error('QA_SUPABASE_URL não é uma URL válida.');
  }
  if (!['http:', 'https:'].includes(base.protocol) || !HOSTS_LOOPBACK.has(base.hostname)) {
    throw new Error('A sonda do portal só chama Supabase em loopback (localhost, 127.0.0.1 ou [::1]).');
  }
  return new URL(`/functions/v1/${FUNCAO_PORTAL}`, base.origin).href;
}

/** `motivo` vem preenchido sempre que `ok` é false. */
export interface ResultadoSonda {
  ok: boolean;
  motivo?: string;
}

/**
 * Interpreta a resposta da função a um token inválido. Servida e com banco, a
 * `patient-portal` devolve 401 com `{ error }` (supabase/functions/patient-portal/index.ts).
 * 404 = função não servida; 5xx = runtime fora do ar ou erro de boot; 429 =
 * rate limit (fail-closed) sem tabela ou estourado.
 */
export function avaliarSonda(status: number, corpo: unknown): ResultadoSonda {
  const erro = corpo && typeof corpo === 'object' ? (corpo as { error?: unknown }).error : undefined;
  if (status === 401 && typeof erro === 'string') return { ok: true };
  if (status === 404) return { ok: false, motivo: `${FUNCAO_PORTAL} não está servida (404).` };
  if (status === 429) return { ok: false, motivo: `${FUNCAO_PORTAL} respondeu 429 (rate limit ou tabela de rate limit ausente).` };
  if (status >= 500) return { ok: false, motivo: `${FUNCAO_PORTAL} falhou com ${status} (edge runtime fora do ar ou erro de boot).` };
  return { ok: false, motivo: `${FUNCAO_PORTAL} respondeu ${status} a um token inválido; esperado 401 com { error }.` };
}

type Buscar = (url: string, init: { method: string; headers: Record<string, string>; body: string }) =>
  Promise<{ status: number; json(): Promise<unknown> }>;

/** Chama a função com token inválido e avalia a resposta. Não imprime chave. */
export async function sondarPortal(
  supabaseUrl: string,
  anonKey: string,
  buscar: Buscar = fetch as unknown as Buscar,
): Promise<ResultadoSonda> {
  let url: string;
  try {
    url = urlFuncaoPortal(supabaseUrl);
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'URL inválida.' };
  }
  try {
    const resposta = await buscar(url, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_profile', token: TOKEN_SONDA }),
    });
    const corpo = await resposta.json().catch(() => null);
    return avaliarSonda(resposta.status, corpo);
  } catch {
    return { ok: false, motivo: `Sem resposta de ${url} (Supabase local ou edge runtime fora do ar).` };
  }
}

/** Entrada do `scripts/qa/conferir-portal-local.mjs`. 0 = servida; 1 = não. */
export async function executarConferenciaPortal(
  env: Ambiente = process.env,
  log: (linha: string) => void = console.log,
  buscar?: Buscar,
): Promise<number> {
  const url = env.QA_SUPABASE_URL?.trim();
  const anon = env.QA_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    log('Faltam QA_SUPABASE_URL e/ou QA_SUPABASE_ANON_KEY.');
    return 1;
  }
  const resultado = await sondarPortal(url, anon, buscar);
  if (resultado.ok) {
    log(`${FUNCAO_PORTAL} servida localmente. Pode definir ${VAR_PORTAL_EDGE}=${VALOR_PORTAL_EDGE}.`);
    return 0;
  }
  log(resultado.motivo ?? 'Sonda do portal falhou.');
  return 1;
}
