import { describe, expect, it } from 'vitest';
import {
  chaveSessaoSupabase,
  configurarPonte,
  reescreverCabecalhos,
  reescreverUrl,
} from '../../../tests/fixtures/ponteSupabaseApp.ts';
import { analisarModuloCliente, CHAVE_SINTETICA } from '../../../tests/fixtures/chaveAppTeste.ts';
import { SKIPS_PERMITIDOS } from '../../../tests/fixtures/gateSkip.ts';

// CLIN-QA-564: ponte entre o app em --mode test e o Supabase local do QA.
const QA = 'chave-anon-qa-sintetica';

describe('configurarPonte', () => {
  it('devolve null sem Supabase do QA configurado', () => {
    expect(configurarPonte({})).toBeNull();
  });

  it('usa a URL do bundle para a chave de sessão, não a do QA', () => {
    const p = configurarPonte({ QA_SUPABASE_URL: 'http://localhost:54321', QA_SUPABASE_ANON_KEY: QA })!;
    expect(p.appOrigin).toBe('http://127.0.0.1:54321');
    expect(p.qaOrigin).toBe('http://localhost:54321');
    expect(p.chaveSessao).toBe('sb-127-auth-token');
    expect(p.anonKey).toBe(QA);
  });

  it('recusa destino ou app fora de loopback', () => {
    expect(() => configurarPonte({ QA_SUPABASE_URL: 'https://projeto.supabase.co', QA_SUPABASE_ANON_KEY: QA })).toThrow();
    expect(() => configurarPonte({
      QA_SUPABASE_URL: 'http://127.0.0.1:54321', QA_SUPABASE_ANON_KEY: QA, QA_APP_SUPABASE_URL: 'https://api.elolab.example',
    })).toThrow(/loopback/);
  });

  it('recusa protocolos diferentes entre app e destino', () => {
    expect(() => configurarPonte({
      QA_SUPABASE_URL: 'https://127.0.0.1:54321', QA_SUPABASE_ANON_KEY: QA,
    })).toThrow(/protocolo/);
  });
});

describe('reescreverCabecalhos', () => {
  it('troca apikey e o Bearer igual à chave antiga', () => {
    const h = reescreverCabecalhos({ apikey: CHAVE_SINTETICA, authorization: `Bearer ${CHAVE_SINTETICA}`, accept: 'x' }, QA);
    expect(h).toEqual({ apikey: QA, authorization: `Bearer ${QA}`, accept: 'x' });
  });

  it('mantém o JWT de sessão do usuário', () => {
    const h = reescreverCabecalhos({ apikey: CHAVE_SINTETICA, authorization: 'Bearer jwt.do.usuario' }, QA);
    expect(h.authorization).toBe('Bearer jwt.do.usuario');
    expect(h.apikey).toBe(QA);
  });

  it('não mexe em requisição sem apikey e não altera o objeto original', () => {
    const original = { authorization: `Bearer ${CHAVE_SINTETICA}` };
    expect(reescreverCabecalhos(original, QA)).toEqual(original);
    const comChave = { apikey: CHAVE_SINTETICA };
    reescreverCabecalhos(comChave, QA);
    expect(comChave.apikey).toBe(CHAVE_SINTETICA);
  });
});

describe('reescreverUrl', () => {
  const ponte = { appOrigin: 'http://127.0.0.1:54321', qaOrigin: 'http://localhost:55555', anonKey: QA };

  it('troca a origem e preserva caminho e query', () => {
    expect(reescreverUrl('http://127.0.0.1:54321/rest/v1/pacientes?select=id&limit=1', ponte))
      .toBe('http://localhost:55555/rest/v1/pacientes?select=id&limit=1');
  });

  it('troca apikey de query string', () => {
    expect(reescreverUrl(`http://127.0.0.1:54321/storage/v1/x?apikey=${CHAVE_SINTETICA}`, ponte))
      .toBe(`http://localhost:55555/storage/v1/x?apikey=${QA}`);
  });

  it('ignora outras origens, inclusive o próprio app', () => {
    expect(reescreverUrl('http://127.0.0.1:4173/dashboard', ponte)).toBe('http://127.0.0.1:4173/dashboard');
  });
});

describe('chaveSessaoSupabase', () => {
  it('segue a regra do supabase-js', () => {
    expect(chaveSessaoSupabase('http://127.0.0.1:54321')).toBe('sb-127-auth-token');
    expect(chaveSessaoSupabase('http://localhost:54321')).toBe('sb-localhost-auth-token');
  });
});

describe('analisarModuloCliente', () => {
  const modulo = (env: object) => `import.meta.env = ${JSON.stringify(env)};// resto do módulo`;

  it('detecta a chave sintética (o defeito do 564)', () => {
    const a = analisarModuloCliente(modulo({
      MODE: 'test', VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: CHAVE_SINTETICA,
    }), QA);
    expect(a).toEqual({ url: 'http://127.0.0.1:54321', modo: 'test', chave: 'sintetica' });
  });

  it('reconhece a chave do QA e a chave desconhecida', () => {
    expect(analisarModuloCliente(modulo({ VITE_SUPABASE_PUBLISHABLE_KEY: QA }), QA).chave).toBe('qa');
    expect(analisarModuloCliente(modulo({ VITE_SUPABASE_ANON_KEY: 'outra' }), QA).chave).toBe('outra');
    expect(analisarModuloCliente(modulo({}), QA).chave).toBe('ausente');
  });

  it('falha quando o módulo não vem do Vite em dev', () => {
    expect(() => analisarModuloCliente('export const x = 1;')).toThrow(/import\.meta\.env/);
  });
});

describe('allowlist do gate de skip', () => {
  it('não aceita mais o skip app-local-564', () => {
    expect(SKIPS_PERMITIDOS).not.toHaveProperty('app-local-564');
  });
});
