// Cookie Consent Management — LGPD / Lei 13.709/2018

export type CookieCategory = 'necessary' | 'analytics' | 'marketing' | 'functional';

export interface CookieConsent {
  necessary: boolean; // Always true, cannot be disabled
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
  consentedAt: string;
  version: string;
}

const CONSENT_KEY = 'elolab_cookie_consent';
const CONSENT_VERSION = '1.0.0';
/** Disparado quando a pessoa escolhe os cookies, para outros avisos aguardarem o banner. */
export const COOKIE_CONSENT_EVENT = 'elolab:cookie-consent';

export function getCookieConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const consent = JSON.parse(raw) as CookieConsent;
    if (consent.version !== CONSENT_VERSION) return null;
    return consent;
  } catch {
    return null;
  }
}

export function setCookieConsent(consent: Omit<CookieConsent, 'consentedAt' | 'version' | 'necessary'>): CookieConsent {
  const full: CookieConsent = {
    ...consent,
    necessary: true,
    consentedAt: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(full));
  applyCookiePreferences(full);
  window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
  return full;
}

export function acceptAllCookies(): CookieConsent {
  return setCookieConsent({ analytics: true, marketing: true, functional: true });
}

export function rejectOptionalCookies(): CookieConsent {
  return setCookieConsent({ analytics: false, marketing: false, functional: false });
}

export function revokeCookieConsent(): void {
  localStorage.removeItem(CONSENT_KEY);
  clearNonEssentialCookies();
}

export function hasConsented(): boolean {
  return getCookieConsent() !== null;
}

function applyCookiePreferences(consent: CookieConsent): void {
  if (!consent.analytics) {
    // Disable analytics tracking
    clearCookiesByPrefix('_ga');
    clearCookiesByPrefix('_gid');
  }
  if (!consent.marketing) {
    clearCookiesByPrefix('_fbp');
    clearCookiesByPrefix('_gcl');
  }
}

function clearNonEssentialCookies(): void {
  clearCookiesByPrefix('_ga');
  clearCookiesByPrefix('_gid');
  clearCookiesByPrefix('_fbp');
  clearCookiesByPrefix('_gcl');
}

function clearCookiesByPrefix(prefix: string): void {
  document.cookie.split(';').forEach(cookie => {
    const name = cookie.split('=')[0].trim();
    if (name.startsWith(prefix)) {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    }
  });
}

// Cookie information catalog for transparency
export const COOKIE_CATALOG = [
  {
    category: 'necessary' as CookieCategory,
    name: 'Cookies Essenciais',
    description: 'Necessários para o funcionamento básico do sistema. Incluem autenticação, sessão e preferências de segurança.',
    cookies: [
      { name: 'sb-*-auth-token', purpose: 'Autenticação do usuário via Supabase', duration: 'Sessão', provider: 'Supabase' },
      { name: 'elolab_cookie_consent', purpose: 'Armazena suas preferências de cookies', duration: '1 ano', provider: 'EloLab' },
      { name: 'theme', purpose: 'Preferência de tema (claro/escuro)', duration: 'Persistente', provider: 'EloLab' },
    ],
    required: true,
  },
  {
    category: 'functional' as CookieCategory,
    name: 'Cookies Funcionais',
    description: 'Permitem funcionalidades adicionais como chat interno, notificações e personalização da interface.',
    cookies: [
      { name: 'elolab_sidebar_state', purpose: 'Estado do menu lateral', duration: 'Persistente', provider: 'EloLab' },
      { name: 'elolab_notification_dismissed', purpose: 'Notificações já visualizadas', duration: '30 dias', provider: 'EloLab' },
    ],
    required: false,
  },
  {
    category: 'analytics' as CookieCategory,
    name: 'Cookies de Análise',
    description: 'Ajudam a entender como o sistema é utilizado para melhorias contínuas. Dados anonimizados.',
    cookies: [
      { name: '_ga / _gid', purpose: 'Google Analytics — métricas de uso', duration: '2 anos / 24h', provider: 'Google' },
    ],
    required: false,
  },
  {
    category: 'marketing' as CookieCategory,
    name: 'Cookies de Marketing',
    description: 'Utilizados para campanhas e comunicações relevantes sobre o EloLab.',
    cookies: [
      { name: '_fbp', purpose: 'Facebook Pixel — atribuição de campanhas', duration: '90 dias', provider: 'Meta' },
    ],
    required: false,
  },
];
