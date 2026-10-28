import { describe, expect, it } from 'vitest';
import {
  avaliarSonda,
  decidirPortalEdge,
  executarConferenciaPortal,
  sondarPortal,
  TOKEN_SONDA,
  urlFuncaoPortal,
  VALOR_PORTAL_EDGE,
  VAR_PORTAL_EDGE,
} from '../../../tests/fixtures/portalEdge.ts';

const LOCAL = 'http://127.0.0.1:54321';

function resposta(status: number, corpo: unknown) {
  return async () => ({ status, json: async () => corpo });
}

describe('portal do paciente no security-e2e — decisão', () => {
  it('roda quando a variável está confirmada, mesmo no CI', () => {
    expect(decidirPortalEdge({ CI: 'true', [VAR_PORTAL_EDGE]: VALOR_PORTAL_EDGE })).toBeNull();
  });

  it('no CI, sem a variável, falha em vez de pular', () => {
    expect(() => decidirPortalEdge({ CI: 'true' })).toThrow(/QA_PORTAL_EDGE_LOCAL=ELOLAB_LOCAL_PORTAL/);
    expect(() => decidirPortalEdge({ QA_SECURITY_REQUIRED: '1' })).toThrow(/obrigatória/);
  });

  it('valor diferente do combinado não habilita (evita "true" por engano)', () => {
    expect(() => decidirPortalEdge({ CI: 'true', [VAR_PORTAL_EDGE]: 'true' })).toThrow();
  });

  it('o stub de WhatsApp/IA não habilita o portal', () => {
    expect(() => decidirPortalEdge({ CI: 'true', QA_EDGE_STUB_CONFIRMED: 'ELOLAB_LOCAL_STUB' })).toThrow();
  });

  it('fora do CI, sem a variável, pula com motivo', () => {
    expect(decidirPortalEdge({})).toMatch(/patient-portal/);
  });
});

describe('portal do paciente — sonda', () => {
  it('monta a URL só em loopback', () => {
    expect(urlFuncaoPortal(LOCAL)).toBe('http://127.0.0.1:54321/functions/v1/patient-portal');
    expect(() => urlFuncaoPortal('https://abc.supabase.co')).toThrow(/loopback/);
    expect(() => urlFuncaoPortal('http://127.0.0.1.nip.io:54321')).toThrow(/loopback/);
  });

  it('aceita só 401 com { error } como função servida', () => {
    expect(avaliarSonda(401, { error: 'Token inválido ou expirado' })).toEqual({ ok: true });
    expect(avaliarSonda(401, null).ok).toBe(false);
    expect(avaliarSonda(200, { perfil: {} }).ok).toBe(false);
    expect(avaliarSonda(404, { msg: 'Function not found' })).toMatchObject({ ok: false, motivo: /404/ });
    expect(avaliarSonda(502, null)).toMatchObject({ ok: false, motivo: /502/ });
    expect(avaliarSonda(429, { error: 'x' })).toMatchObject({ ok: false, motivo: /429/ });
  });

  it('envia token sabidamente inválido e não chama host remoto', async () => {
    const chamadas: Array<{ url: string; body: string }> = [];
    const r = await sondarPortal(LOCAL, 'anon-local', async (url, init) => {
      chamadas.push({ url, body: init.body });
      return { status: 401, json: async () => ({ error: 'Token inválido ou expirado' }) };
    });
    expect(r.ok).toBe(true);
    expect(JSON.parse(chamadas[0].body).token).toBe(TOKEN_SONDA);

    const remoto = await sondarPortal('https://abc.supabase.co', 'k', async () => {
      throw new Error('não deveria chamar');
    });
    expect(remoto).toMatchObject({ ok: false, motivo: /loopback/ });
  });

  it('runtime fora do ar vira motivo legível', async () => {
    const r = await sondarPortal(LOCAL, 'k', async () => { throw new Error('ECONNREFUSED'); });
    expect(r).toMatchObject({ ok: false, motivo: /Sem resposta/ });
  });

  it('script: código de saída e nenhuma chave no log', async () => {
    const linhas: string[] = [];
    const env = { QA_SUPABASE_URL: LOCAL, QA_SUPABASE_ANON_KEY: 'chave-secreta-local' };
    expect(await executarConferenciaPortal(env, (l) => linhas.push(l), resposta(401, { error: 'x' }))).toBe(0);
    expect(await executarConferenciaPortal(env, (l) => linhas.push(l), resposta(404, {}))).toBe(1);
    expect(await executarConferenciaPortal({}, (l) => linhas.push(l))).toBe(1);
    expect(linhas.join('\n')).not.toContain('chave-secreta-local');
  });
});
