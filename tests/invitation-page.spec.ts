import { expect, test, type Page } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });
async function limits(page: Page, full = false) {
  await page.route('**/rest/v1/rpc/uso_plano_clinica', route => route.fulfill({ json: {
    verificado_em: new Date().toISOString(), plano_nome: 'Plano QA', recursos: [
      { chave: 'funcionarios', usado: full ? 10 : 2, limite: 10 },
      { chave: 'medicos', usado: 1, limite: 5 },
    ],
  } }));
}
for (const width of [1440, 390]) {
  test(`invitation is a guarded page at ${width}px`, async ({ page }, info) => {
    await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
    await limits(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/equipe/convites/novo');
    await expect(page.getByRole('heading', { name: 'Convidar funcionário', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`invitation-header-${width}.png`) });
    await page.getByLabel('Nome', { exact: true }).fill('Equipe QA');
    await page.getByLabel('E-mail', { exact: true }).fill('equipe@example.test');
    await page.getByLabel('Recepção', { exact: true }).click();
    await expect(page.getByRole('region', { name: 'Prévia de acesso' })).toContainText('Agenda');
    await page.screenshot({ path: info.outputPath(`invitation-${width}.png`) });
    const save = page.getByRole('button', { name: 'Enviar convite', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect.poll(async () => { const b = await save.boundingBox(); return b ? b.y + b.height : Infinity; }).toBeLessThanOrEqual(width < 1024 ? 840 : 900);
    await page.screenshot({ path: info.outputPath(`invitation-footer-${width}.png`) });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar nesta página' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Equipe QA');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar e sair' }).click();
    await expect(page).toHaveURL('/equipe?aba=convites');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('invitation preserves draft on failure and routes to recovery when email was not sent', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await limits(page);
  let writes = 0;
  await page.route('**/functions/v1/invite-employee', async route => {
    writes++;
    expect(route.request().postDataJSON()).toEqual({ nome: 'Equipe QA', email: 'equipe@example.test', roles: ['recepcao'] });
    await new Promise(resolve => setTimeout(resolve, 350));
    await route.fulfill({ json: writes === 1 ? { success: false, error: 'Falha sintética de convite' } : { success: true, emailStatus: 'failed' } });
  });
  await page.goto('/equipe?aba=convites');
  await page.getByRole('link', { name: 'Novo convite' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Equipe QA');
  await page.getByLabel('E-mail', { exact: true }).fill('equipe@example.test');
  await page.getByLabel('Recepção', { exact: true }).click();
  await page.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(page.getByLabel('Nome', { exact: true })).toBeDisabled();
  await expect(page.getByText('Falha sintética de convite', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Equipe QA');
  await page.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(page).toHaveURL('/equipe?aba=convites');
  await expect(page.getByText('Convite criado, mas o e-mail não foi enviado.', { exact: true })).toBeVisible();
  expect(writes).toBe(2);
});

test('plan capacity and request failures block invitations, with retry', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  let fail = true;
  await page.route('**/rest/v1/rpc/uso_plano_clinica', route => route.fulfill(fail ? { status: 400, json: { message: 'Falha sintética do plano' } } : { json: { verificado_em: new Date().toISOString(), plano_nome: 'Plano QA', recursos: [{ chave: 'funcionarios', usado: 10, limite: 10 }] } }));
  await page.goto('/equipe/convites/novo');
  await expect(page.getByRole('heading', { name: 'Não foi possível consultar o limite da equipe' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar convite' })).toBeDisabled();
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Limite do plano atingido. Faça upgrade para adicionar mais membros.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar convite' })).toBeDisabled();
});

test('employee without custom labels uses defaults and preserves origin of invitation', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await limits(page);
  await page.route('**/rest/v1/configuracoes_clinica*', route => new URL(route.request().url()).searchParams.get('chave') === 'eq.role_customization' ? route.fulfill({ json: [] }) : route.fallback());
  await page.goto('/equipe/funcionarios/novo');
  await expect(page.getByRole('button', { name: 'Cadastrar', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Não foi possível carregar as configurações de função' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar aos funcionários' }).click();
  await page.getByRole('button', { name: 'Convidar por e-mail' }).click();
  await page.getByRole('button', { name: 'Voltar à equipe' }).click();
  await expect(page).toHaveURL('/equipe?aba=funcionarios');
});

test('reception cannot access invitations page', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false, role: 'recepcao' });
  await page.goto('/equipe/convites/novo');
  await expect(page.getByRole('heading', { name: 'Acesso Negado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar convite' })).toHaveCount(0);
});

test('copy fallback is inline and preserves invitation filter', async ({ page }, info) => {
  await installSyntheticClinic(page, { appOrigin: String(info.project.use.baseURL), platformAdmin: false });
  await limits(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('Clipboard QA')) } }));
  await page.route('**/rest/v1/convites_funcionario*', route => route.fulfill({ json: [{ id: 'invite-qa', email: 'equipe@example.test', nome: 'Equipe QA', roles: ['recepcao'], token: 'synthetic-only', created_at: new Date().toISOString(), expires_at: '2099-01-01T00:00:00Z', accepted_at: null }] }));
  await page.goto('/equipe?aba=convites');
  await page.getByRole('button', { name: /Pendentes/ }).click();
  await page.getByRole('link', { name: 'Novo convite' }).click();
  await page.getByRole('button', { name: 'Voltar à equipe' }).click();
  await expect(page.getByRole('button', { name: /Pendentes/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Copiar link do convite para equipe@example.test' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Link de aceitação do convite')).toBeFocused();
  await expect(page.getByLabel('Link de aceitação do convite')).toHaveValue(/synthetic-only/);
  await page.getByRole('button', { name: 'Fechar link' }).click();
  await expect(page.getByLabel('Link de aceitação do convite')).toHaveCount(0);
});
