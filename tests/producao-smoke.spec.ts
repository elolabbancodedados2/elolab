import { test, expect } from '@playwright/test';

/**
 * Smoke test contra o ambiente PUBLICADO, não contra o servidor de dev.
 *
 * O deploy é Cloudflare Pages (`app.elolab.com.br`). Um push com CI verde não
 * prova que o que chegou lá funciona: build passa, deploy passa, e a página
 * pode abrir em branco por um asset que não subiu, uma CSP que bloqueia o
 * próprio bundle, ou um service worker servindo cache velho.
 *
 * Roda só quando `PRODUCAO_URL` estiver definida — a suíte normal aponta para
 * o dev server e não deve tocar em produção sem intenção explícita:
 *
 *   PRODUCAO_URL=https://app.elolab.com.br npm run test:e2e -- tests/producao-smoke.spec.ts
 */

const PRODUCAO_URL = process.env.PRODUCAO_URL;

test.describe('Produção — smoke', () => {
  test.skip(!PRODUCAO_URL, 'Defina PRODUCAO_URL para rodar o smoke contra o ambiente publicado.');

  test('a landing carrega e renderiza conteúdo real', async ({ page }) => {
    const errosDeConsole: string[] = [];
    const excecoes: string[] = [];
    const requisicoesQuebradas: string[] = [];

    page.on('console', m => { if (m.type() === 'error') errosDeConsole.push(m.text()); });
    page.on('pageerror', e => excecoes.push(e.message));
    page.on('response', r => {
      // 4xx/5xx em asset próprio é o que produz tela branca. Chamadas ao
      // Supabase sem sessão respondem 401/403 e são esperadas aqui.
      if (r.status() >= 400 && new URL(r.url()).host === new URL(PRODUCAO_URL!).host) {
        requisicoesQuebradas.push(`${r.status()} ${r.url()}`);
      }
    });

    const resposta = await page.goto(PRODUCAO_URL!, { waitUntil: 'networkidle' });
    expect(resposta?.status()).toBeLessThan(400);

    expect(excecoes, `exceção não capturada em produção: ${excecoes.join(' | ')}`).toHaveLength(0);
    expect(requisicoesQuebradas, `asset quebrado: ${requisicoesQuebradas.join(' | ')}`).toHaveLength(0);

    // Tela branca responde 200 e passaria num teste de status.
    // No primeiro acesso a um commit novo, main.tsx limpa o service worker e
    // faz um redirect com cache_reset=1. Aguardar esse ciclo evita classificar
    // o estado transitório "Carregando..." como tela branca.
    await expect.poll(async () => ((await page.textContent('body')) ?? '').trim().length, {
      message: 'produção renderizou tela em branco', timeout: 15_000,
    }).toBeGreaterThan(200);
  });

  test('a tela de login carrega e aceita digitação', async ({ page }) => {
    await page.goto(`${PRODUCAO_URL}/auth`, { waitUntil: 'networkidle' });
    const email = page.locator('input[type="email"]').first();
    await expect(email).toBeVisible();
    await email.fill('teste@exemplo.com');
    await expect(email).toHaveValue('teste@exemplo.com');
  });

  test('o bundle e o service worker são servidos com o cache certo', async ({ request }) => {
    const html = await request.get(PRODUCAO_URL!);
    const corpo = await html.text();

    const asset = corpo.match(/\/assets\/[A-Za-z0-9._-]+\.js/)?.[0];
    expect(asset, 'nenhum bundle referenciado no HTML').toBeTruthy();

    const js = await request.get(`${PRODUCAO_URL}${asset}`);
    expect(js.status(), `bundle ${asset} não foi servido`).toBe(200);

    // O sw.js precisa ser revalidado sempre; se for cacheado por um ano, o
    // usuário fica preso numa versão antiga do app para sempre.
    const sw = await request.get(`${PRODUCAO_URL}/sw.js`);
    if (sw.ok()) {
      const cache = sw.headers()['cache-control'] ?? '';
      expect(cache, `sw.js com cache errado: "${cache}"`).toMatch(/max-age=0|no-cache|must-revalidate/);
    }
  });

  test('os cabeçalhos de segurança chegaram ao ar', async ({ request }) => {
    const resposta = await request.get(PRODUCAO_URL!);
    const headers = resposta.headers();

    // Estão declarados em vercel.json, mas o deploy é Cloudflare Pages — que
    // ignora esse arquivo. Este teste existe para revelar essa discrepância em
    // vez de deixá-la passar como se estivesse configurada.
    const esperados = [
      'content-security-policy',
      'x-content-type-options',
      'strict-transport-security',
      'referrer-policy',
    ];
    const ausentes = esperados.filter(h => !headers[h]);

    expect(
      ausentes,
      `cabeçalhos de segurança ausentes em produção: ${ausentes.join(', ')}. ` +
      'Estão em vercel.json, mas o deploy é Cloudflare Pages — precisa de _headers ou wrangler.toml.',
    ).toHaveLength(0);

    expect(headers['content-security-policy'], 'CSP precisa permitir a busca de CEP').toContain('https://viacep.com.br');
  });
});
