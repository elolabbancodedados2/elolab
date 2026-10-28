/**
 * Analytics de funil (camada B do docs/gtm/plano-analytics.md).
 *
 * Regras:
 * - Neutro de fornecedor: nenhuma ferramenta está instalada. A escolha
 *   (PostHog, Plausible etc.), o DPA e a base legal são decisões do
 *   responsável e requerem avaliação especializada. Enquanto nenhum provedor
 *   for registrado com `registrarProvedorAnalytics`, nada sai do navegador.
 * - Só envia com consentimento de analytics do CookieConsent, conferido a
 *   cada chamada (vale também para revogação sem recarregar a página).
 * - Sem dados pessoais: cada evento tem uma lista fechada de propriedades;
 *   o resto é descartado, e valores com cara de e-mail, CPF ou telefone
 *   também são descartados.
 * - Rotas do portal do paciente não são instrumentadas.
 */
import { COOKIE_CONSENT_EVENT, getCookieConsent } from '@/lib/cookies';

export interface AnalyticsProvider {
  capturar(evento: AnalyticsEvento, propriedades: Record<string, string | number | boolean>): void;
  /** Chamado quando o consentimento de analytics deixa de existir. */
  desativar?(): void;
}

export const UTM_CHAVES = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'seg'] as const;
type UtmChave = (typeof UTM_CHAVES)[number];
export type Utm = Partial<Record<UtmChave, string>>;

/** Eventos de navegador e propriedades permitidas (seção 4 do plano). */
const CATALOGO = {
  landing_viewed: [...UTM_CHAVES, 'referrer_host', 'path'],
  plan_selected: ['plan_slug', 'mode', ...UTM_CHAVES],
  signup_started: ['plan_slug', 'mode', ...UTM_CHAVES],
  signup_submitted: ['plan_slug', 'mode', ...UTM_CHAVES],
  checkout_viewed: ['plan_slug', 'mode'],
  checkout_completed: ['plan_slug', 'mode', 'metodo'],
} as const satisfies Record<string, readonly string[]>;

export type AnalyticsEvento = keyof typeof CATALOGO;
type Propriedades = Record<string, string | number | boolean | null | undefined>;

const ROTAS_DO_PACIENTE = ['/portal-paciente', '/agendar', '/portal-guias', '/verificar-assinatura'];
const UTM_STORAGE_KEY = 'elolab_utm';
const MAX_VALOR = 100;
const PARECE_DADO_PESSOAL = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/, // e-mail
  /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/, // CPF
  /\(?\d{2}\)?\s?9?\d{4}-?\d{4}/, // telefone
];

let provedor: AnalyticsProvider | null = null;
let ouvindoConsentimento = false;

export function registrarProvedorAnalytics(novo: AnalyticsProvider | null): void {
  provedor = novo;
  garantirOuvinteDeConsentimento();
}

export function temConsentimentoAnalytics(): boolean {
  return getCookieConsent()?.analytics === true;
}

function garantirOuvinteDeConsentimento() {
  if (ouvindoConsentimento || typeof window === 'undefined') return;
  ouvindoConsentimento = true;
  window.addEventListener(COOKIE_CONSENT_EVENT, () => {
    if (!temConsentimentoAnalytics()) provedor?.desativar?.();
  });
}

function rotaDoPaciente(pathname: string) {
  return ROTAS_DO_PACIENTE.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`));
}

export function limparPropriedades(evento: AnalyticsEvento, propriedades: Propriedades = {}) {
  const permitidas = new Set<string>(CATALOGO[evento]);
  const limpas: Record<string, string | number | boolean> = {};
  for (const [chave, valor] of Object.entries(propriedades)) {
    if (!permitidas.has(chave) || valor === null || valor === undefined) continue;
    if (typeof valor === 'string') {
      const texto = valor.trim().slice(0, MAX_VALOR);
      if (!texto || PARECE_DADO_PESSOAL.some((padrao) => padrao.test(texto))) continue;
      limpas[chave] = texto;
    } else if (typeof valor === 'number' ? Number.isFinite(valor) : typeof valor === 'boolean') {
      limpas[chave] = valor;
    }
  }
  return limpas;
}

/** Registra um evento do funil. Sem consentimento ou sem provedor, não faz nada. */
export function track(evento: AnalyticsEvento, propriedades?: Propriedades): void {
  try {
    if (!provedor || !temConsentimentoAnalytics()) return;
    if (typeof window !== 'undefined' && rotaDoPaciente(window.location.pathname)) return;
    provedor.capturar(evento, limparPropriedades(evento, propriedades));
  } catch (error) {
    // Analytics nunca pode quebrar a tela; o erro fica só no console.
    console.warn('[analytics] evento não registrado', evento, error);
  }
}

function lerUtmDaUrl(search: string): Utm {
  const params = new URLSearchParams(search);
  const utm: Utm = {};
  for (const chave of UTM_CHAVES) {
    const valor = params.get(chave)?.trim().toLowerCase().slice(0, MAX_VALOR);
    if (valor) utm[chave] = valor;
  }
  return utm;
}

/**
 * Lê UTM e `seg` da URL e guarda na sessão da aba (sessionStorage, sem cookie
 * nem localStorage, conforme a seção 5.2 do plano). Devolve a origem da sessão:
 * a da URL atual, se houver, senão a já guardada.
 */
export function capturarUtm(search: string = typeof window !== 'undefined' ? window.location.search : ''): Utm {
  const daUrl = lerUtmDaUrl(search);
  try {
    if (Object.keys(daUrl).length > 0) {
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(daUrl));
      return daUrl;
    }
    const salvo = sessionStorage.getItem(UTM_STORAGE_KEY);
    return salvo ? lerUtmDaUrl(new URLSearchParams(JSON.parse(salvo) as Record<string, string>).toString()) : {};
  } catch {
    return daUrl;
  }
}

/** Acrescenta a origem da sessão aos parâmetros (repasse da landing para o app). */
export function anexarUtm(params: URLSearchParams, utm: Utm = capturarUtm()): URLSearchParams {
  for (const chave of UTM_CHAVES) {
    const valor = utm[chave];
    if (valor && !params.has(chave)) params.set(chave, valor);
  }
  return params;
}

export function hostDoReferrer(referrer: string = typeof document !== 'undefined' ? document.referrer : ''): string | undefined {
  try {
    return referrer ? new URL(referrer).hostname : undefined;
  } catch {
    return undefined;
  }
}
