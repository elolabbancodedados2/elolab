import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { DEFAULT_LOCAL_SUPABASE_URL } from '../scripts/test-supabase-env.ts';
import { CHAVE_SINTETICA } from './fixtures/chaveAppTeste.ts';
import { chaveSessaoSupabase, instalarPonteSupabase, type PonteSupabase } from './fixtures/ponteSupabaseApp.ts';

/**
 * Prova da ponte do CLIN-QA-564 sem precisar de um Supabase de verdade.
 *
 * Um "Supabase" falso em `localhost` com porta aleatória registra os
 * cabeçalhos recebidos. O app em `--mode test` chama `127.0.0.1:54321` com a
 * chave sintética, e a ponte precisa entregar a chamada ao servidor falso com
 * a chave do QA. Dados 100% sintéticos; nada sai da máquina.
 */

const CHAVE_QA = 'chave-anon-qa-sintetica-564';

interface Recebida { metodo: string; caminho: string; headers: IncomingHttpHeaders }

let servidor: Server;
let recebidas: Recebida[] = [];
let ponte: PonteSupabase;

test.skip(Boolean(process.env.QA_BASE_URL), 'A ponte só vale para o app local em --mode test.');

test.beforeAll(async () => {
  servidor = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    recebidas.push({ metodo: req.method ?? '', caminho: req.url ?? '', headers: req.headers });
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('[]');
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const { port } = servidor.address() as AddressInfo;
  ponte = {
    appOrigin: new URL(DEFAULT_LOCAL_SUPABASE_URL).origin,
    // Outro host de propósito: prova também a troca de origem.
    qaOrigin: `http://localhost:${port}`,
    anonKey: CHAVE_QA,
    chaveSessao: chaveSessaoSupabase(DEFAULT_LOCAL_SUPABASE_URL),
  };
});

test.afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
});

test.beforeEach(() => {
  recebidas = [];
});

async function consultarPeloClienteDoApp(page: import('@playwright/test').Page) {
  // Usa o cliente real do app, com a URL e a chave que o bundle de teste tem.
  return page.evaluate(async () => {
    const caminho = '/src/integrations/supabase/client.ts';
    const { supabase } = await import(/* @vite-ignore */ caminho);
    const { error } = await supabase.from('pacientes').select('id').limit(1);
    return error ? String(error.message) : null;
  });
}

test('sem sessão: apikey e Bearer saem com a chave do QA, nunca com a sintética', async ({ page }) => {
  await instalarPonteSupabase(page, ponte);
  await page.goto('/');
  expect(await consultarPeloClienteDoApp(page)).toBeNull();

  const rest = recebidas.filter((r) => r.caminho.startsWith('/rest/v1/pacientes'));
  expect(rest.length, 'a consulta do app chegou ao Supabase do QA pela ponte').toBeGreaterThan(0);
  for (const r of recebidas) {
    expect(r.headers.apikey).toBe(CHAVE_QA);
    expect(r.headers.authorization).not.toContain(CHAVE_SINTETICA);
  }
  expect(rest[0].headers.authorization).toBe(`Bearer ${CHAVE_QA}`);
});

test('com sessão: o JWT do usuário é mantido e só o apikey muda', async ({ page }) => {
  const jwtSintetico = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJxYS01NjQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.assinatura-sintetica';
  const agora = Math.floor(Date.now() / 1000);
  const sessao = {
    access_token: jwtSintetico,
    refresh_token: 'refresh-sintetico-564',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: agora + 3600,
    user: { id: '00000000-0000-4000-8000-000000000564', aud: 'authenticated', role: 'authenticated', email: 'qa-564@exemplo.invalid' },
  };
  await instalarPonteSupabase(page, ponte);
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: ponte.chaveSessao, value: sessao },
  );
  await page.goto('/');
  expect(await consultarPeloClienteDoApp(page)).toBeNull();

  const rest = recebidas.filter((r) => r.caminho.startsWith('/rest/v1/pacientes'));
  expect(rest.length).toBeGreaterThan(0);
  expect(rest[0].headers.apikey).toBe(CHAVE_QA);
  expect(rest[0].headers.authorization).toBe(`Bearer ${jwtSintetico}`);
});

test('sem a ponte o app manda a chave sintética (o defeito do CLIN-QA-564 continua na raiz)', async ({ page }) => {
  // Desvia para o servidor falso só a origem, sem trocar cabeçalho, para
  // registrar o que o app manda sozinho. Quando a raiz for corrigida, este
  // teste falha: aí a ponte pode sair e este caso deve ser invertido.
  await page.route((url) => url.origin === ponte.appOrigin, (route) =>
    route.continue({ url: route.request().url().replace(ponte.appOrigin, ponte.qaOrigin) }));
  await page.goto('/');
  expect(await consultarPeloClienteDoApp(page)).toBeNull();
  const rest = recebidas.filter((r) => r.caminho.startsWith('/rest/v1/pacientes'));
  expect(rest.length).toBeGreaterThan(0);
  expect(rest[0].headers.apikey).toBe(CHAVE_SINTETICA);
});
