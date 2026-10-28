import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  anexarUtm,
  capturarUtm,
  hostDoReferrer,
  limparPropriedades,
  registrarProvedorAnalytics,
  track,
} from '@/lib/analytics';
import { acceptAllCookies, rejectOptionalCookies, revokeCookieConsent } from '@/lib/cookies';

const provedor = { capturar: vi.fn(), desativar: vi.fn() };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  registrarProvedorAnalytics(provedor);
});

afterEach(() => {
  registrarProvedorAnalytics(null);
  vi.clearAllMocks();
});

describe('consentimento', () => {
  it('não envia nada sem escolha no banner', () => {
    track('landing_viewed', { path: '/' });
    expect(provedor.capturar).not.toHaveBeenCalled();
  });

  it('não envia com "Apenas essenciais"', () => {
    rejectOptionalCookies();
    track('landing_viewed', { path: '/' });
    expect(provedor.capturar).not.toHaveBeenCalled();
  });

  it('envia com consentimento de analytics', () => {
    acceptAllCookies();
    track('plan_selected', { plan_slug: 'pro', mode: 'trial' });
    expect(provedor.capturar).toHaveBeenCalledWith('plan_selected', { plan_slug: 'pro', mode: 'trial' });
  });

  it('para de enviar depois da revogação, sem recarregar', () => {
    acceptAllCookies();
    revokeCookieConsent();
    track('landing_viewed', { path: '/' });
    expect(provedor.capturar).not.toHaveBeenCalled();
  });

  it('avisa o provedor quando a pessoa passa a recusar', () => {
    acceptAllCookies();
    rejectOptionalCookies();
    expect(provedor.desativar).toHaveBeenCalled();
  });

  it('não faz nada sem provedor registrado', () => {
    registrarProvedorAnalytics(null);
    acceptAllCookies();
    expect(() => track('landing_viewed')).not.toThrow();
  });

  it('não instrumenta rotas do portal do paciente', () => {
    acceptAllCookies();
    window.history.replaceState({}, '', '/agendar/clinica-1');
    track('landing_viewed', { path: '/agendar/clinica-1' });
    expect(provedor.capturar).not.toHaveBeenCalled();
  });

  it('não deixa erro do provedor quebrar a tela', () => {
    acceptAllCookies();
    provedor.capturar.mockImplementationOnce(() => { throw new Error('falha'); });
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => track('landing_viewed')).not.toThrow();
    aviso.mockRestore();
  });
});

describe('propriedades', () => {
  it('descarta propriedades fora da lista do evento', () => {
    expect(limparPropriedades('checkout_viewed', { plan_slug: 'pro', email: 'a@b.com', nome: 'Fulano', valor: 199 }))
      .toEqual({ plan_slug: 'pro' });
  });

  it('descarta valores com cara de dado pessoal mesmo em campo permitido', () => {
    expect(limparPropriedades('landing_viewed', {
      utm_content: 'contato@clinica.com.br',
      utm_term: '123.456.789-09',
      utm_campaign: '(11) 98765-4321',
      utm_source: 'google',
    })).toEqual({ utm_source: 'google' });
  });

  it('descarta vazios e corta textos longos', () => {
    const limpas = limparPropriedades('landing_viewed', { utm_source: '   ', path: 'x'.repeat(300) });
    expect(limpas).toEqual({ path: 'x'.repeat(100) });
  });
});

describe('UTM', () => {
  it('captura da URL e guarda só na sessão da aba', () => {
    expect(capturarUtm('?utm_source=Google&utm_medium=cpc&seg=clinica&outro=1'))
      .toEqual({ utm_source: 'google', utm_medium: 'cpc', seg: 'clinica' });
    expect(capturarUtm('')).toEqual({ utm_source: 'google', utm_medium: 'cpc', seg: 'clinica' });
    expect(localStorage.length).toBe(0);
  });

  it('repassa a origem aos parâmetros do cadastro sem sobrescrever os existentes', () => {
    const params = anexarUtm(new URLSearchParams({ cadastro: '1', utm_source: 'email' }), { utm_source: 'google', utm_campaign: '2026-11_x' });
    expect(params.get('utm_source')).toBe('email');
    expect(params.get('utm_campaign')).toBe('2026-11_x');
    expect(params.get('cadastro')).toBe('1');
  });

  it('extrai só o host do referrer', () => {
    expect(hostDoReferrer('https://www.google.com/search?q=clinica')).toBe('www.google.com');
    expect(hostDoReferrer('')).toBeUndefined();
    expect(hostDoReferrer('nao-e-url')).toBeUndefined();
  });
});
