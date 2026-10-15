import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test('modal do trial explica cartão, valor e sequência antes do cadastro', async ({ page }, testInfo) => {
  const synthetic = await installSyntheticClinic(page, { authenticated: false, includePlanCatalog: true });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');

    const proCard = page.locator('#planos div.relative.rounded-3xl').filter({ has: page.getByRole('heading', { name: 'EloLab Pro', exact: true }) });
    const ultraCard = page.locator('#planos div.relative.rounded-3xl').filter({ has: page.getByRole('heading', { name: 'EloLab Ultra', exact: true }) });
    await expect(ultraCard).toContainText('Inclui os recursos do EloLab Pro e o Agente de IA no WhatsApp');
    await expect(ultraCard).not.toContainText('Agenda');
    await expect(proCard).toContainText('Agenda');
    await page.locator('#planos').screenshot({ path: testInfo.outputPath(`landing-planos-${viewport.width}.png`) });
    await page.getByRole('button', { name: /testar 3 dias grátis/i }).click();

    const dialog = page.getByRole('dialog', { name: 'Comece seus 3 dias grátis' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('list', { name: 'Etapas para iniciar o teste' }).getByRole('listitem')).toHaveCount(3);
    await expect(dialog).toContainText('Hoje você não paga pelo EloLab');
    await expect(dialog).toContainText(/validação temporária do cartão/i);
    await expect(dialog).toContainText(/R\$\s*499,00\/mês/i);
    await expect(dialog).toContainText(/o acesso ao plano termina ao cancelar/i);
    await expect(dialog.getByRole('button', { name: 'Criar conta e seguir para o cartão' })).toBeVisible();
    await dialog.screenshot({ path: testInfo.outputPath(`landing-trial-${viewport.width}.png`) });
  }

  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
