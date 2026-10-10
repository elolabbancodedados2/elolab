import { expect, test, type Page, type TestInfo } from '@playwright/test';

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'compact-desktop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];

const publicPages = [
  { name: 'landing', path: '/' },
  { name: 'login', path: '/auth' },
  { name: 'password-reset', path: '/redefinir-senha' },
  { name: 'plans', path: '/planos' },
];

type Finding = {
  severity: 'high' | 'medium' | 'low';
  page: string;
  viewport: string;
  issue: string;
  count?: number;
};

async function inspect(page: Page, pageName: string, viewportName: string): Promise<Finding[]> {
  return page.evaluate(({ pageName, viewportName }) => {
    const findings: Finding[] = [];
    const width = document.documentElement.scrollWidth;
    if (width > window.innerWidth + 1) {
      findings.push({
        severity: 'high', page: pageName, viewport: viewportName,
        issue: `Conteúdo ultrapassa a largura da tela em ${width - window.innerWidth}px.`,
      });
    }

    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const unnamedButtons = [...document.querySelectorAll('button,[role="button"]')]
      .filter(visible)
      .filter((element) => {
        const text = element.textContent?.trim();
        return !text && !element.getAttribute('aria-label') && !element.getAttribute('title');
      }).length;
    if (unnamedButtons) {
      findings.push({ severity: 'high', page: pageName, viewport: viewportName,
        issue: 'Botões visíveis sem nome acessível.', count: unnamedButtons });
    }

    const unlabeledFields = [...document.querySelectorAll('input:not([type="hidden"]),select,textarea')]
      .filter(visible)
      .filter((element) => {
        const field = element as HTMLInputElement;
        const id = field.id;
        return !field.labels?.length && !field.getAttribute('aria-label') &&
          !field.getAttribute('aria-labelledby') && !field.getAttribute('title') &&
          !(id && document.querySelector(`label[for="${CSS.escape(id)}"]`));
      }).length;
    if (unlabeledFields) {
      findings.push({ severity: 'high', page: pageName, viewport: viewportName,
        issue: 'Campos visíveis sem rótulo acessível.', count: unlabeledFields });
    }

    const smallText = [...document.querySelectorAll('body *')]
      .filter(visible)
      .filter((element) => element.children.length === 0 && (element.textContent?.trim().length ?? 0) > 0)
      .filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 12).length;
    if (smallText) {
      findings.push({ severity: 'low', page: pageName, viewport: viewportName,
        issue: 'Textos menores que 12px podem ficar difíceis de ler.', count: smallText });
    }

    const smallTargets = [...document.querySelectorAll('a,button,[role="button"],input[type="checkbox"],input[type="radio"]')]
      .filter(visible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 40 || rect.height < 40;
      }).length;
    if (smallTargets) {
      findings.push({ severity: 'medium', page: pageName, viewport: viewportName,
        issue: 'Alvos clicáveis menores que 40px podem ser difíceis de tocar.', count: smallTargets });
    }

    return findings;
  }, { pageName, viewportName });
}

async function capture(page: Page, testInfo: TestInfo, name: string, findings: Finding[]) {
  const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${name}.png`, { body: screenshot, contentType: 'image/png' });
  await testInfo.attach(`${name}-findings.json`, {
    body: Buffer.from(JSON.stringify(findings, null, 2)),
    contentType: 'application/json',
  });
}

test.describe('QA visual — UX, frontend e design', () => {
  test('páginas públicas: conteúdo, erros e dimensões responsivas', async ({ page }, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));

    for (const route of publicPages) {
      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
        expect(response?.status(), `${route.path} deve responder sem erro de servidor`).toBeLessThan(500);
        await expect.poll(async () => ((await page.locator('body').innerText()) ?? '').trim().length,
          { message: `${route.path} deve exibir conteúdo`, timeout: 15_000 }).toBeGreaterThan(30);

        const findings = await inspect(page, route.name, viewport.name);
        await capture(page, testInfo, `${route.name}-${viewport.name}`, findings);
        expect(findings, `${route.path} tem achados de UX em ${viewport.name}`).toHaveLength(0);
      }
    }

    expect(runtimeErrors, `erros de execução: ${runtimeErrors.join(' | ')}`).toHaveLength(0);
  });

  test('login: validação vazia é clara e não envia o formulário', async ({ page }, testInfo) => {
    let requestsToAuth = 0;
    page.on('request', (request) => {
      if (/\/auth\/v1\/token/.test(request.url())) requestsToAuth += 1;
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    const fields = page.locator('input:not([type="hidden"])');
    await expect(fields.first()).toBeVisible();
    await page.locator('form').getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByText('Informe seu e-mail.')).toBeVisible();
    await expect(page.getByText('Informe sua senha.')).toBeVisible();
    expect(requestsToAuth, 'formulário vazio não deve chamar autenticação').toBe(0);

    const findings = await inspect(page, 'login-validation', 'desktop');
    await capture(page, testInfo, 'login-validation-desktop', findings);
  });

  test('respeita preferência de movimento reduzido nas animações da aplicação', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /acesse sua conta/i })).toBeVisible();

    const reducedMotionEnabled = await page.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    expect(reducedMotionEnabled).toBe(true);

    const authCardTransform = await page.locator('form').evaluate((form) => {
      const motionCard = form.closest('div[class*="max-w-"]');
      return motionCard ? getComputedStyle(motionCard).transform : null;
    });
    expect(authCardTransform).toMatch(/^none$|^matrix\(1, 0, 0, 1, 0, 0\)$/);
  });
});
