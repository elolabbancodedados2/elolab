import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test('não carrega o formulário do cartão no teste grátis antes do consentimento', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page);
  let brickRequests = 0;
  await page.route('https://sdk.mercadopago.com/**', async (route) => {
    brickRequests++;
    await route.abort();
  });
  await page.route('**/functions/v1/mercadopago-checkout', async (route) => {
    const request = route.request().postDataJSON() as { action?: string };
    if (request.action !== 'billing_status') {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Ação não esperada.' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        public_key: 'TEST-00000000-0000-0000-0000-000000000000', sandbox: true, trial_elegivel: true,
        plano: { id: 'synthetic-plan', slug: 'elolab-ultra', nome: 'EloLab Ultra', descricao: null, valor: 499, frequencia: 'mensal', trial_dias: 3, features: [], periodo_meses: 1 },
        assinatura: null, pedido_aberto: null,
      }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/planos/checkout/elolab-ultra?trial=1');

  await expect(page.getByLabel(/Autorizo a cobrança recorrente de/)).toBeVisible();
  await expect(page.getByRole('status')).toContainText(/Marque a autorização acima para carregar o formulário/);
  await expect(page.getByText(/Carregando formulário seguro do Mercado Pago/)).toHaveCount(0);
  expect(brickRequests).toBe(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('pedir outro meio de pagamento exige nova confirmação do teste grátis', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page);
  let brickRequests = 0;
  await page.route('https://sdk.mercadopago.com/**', async (route) => {
    brickRequests++;
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.MercadoPago = class { bricks() { return { create: (_name, _id, settings) => { setTimeout(() => settings.callbacks.onReady(), 0); return { unmount() {} }; } }; } };',
    });
  });
  await page.route('**/functions/v1/mercadopago-checkout', async (route) => {
    const request = route.request().postDataJSON() as { action?: string };
    if (request.action !== 'billing_status') {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Ação não esperada.' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        public_key: 'TEST-00000000-0000-0000-0000-000000000000', sandbox: true, trial_elegivel: true,
        plano: { id: 'synthetic-plan', slug: 'elolab-ultra', nome: 'EloLab Ultra', descricao: null, valor: 499, frequencia: 'mensal', trial_dias: 3, features: [], periodo_meses: 1 },
        assinatura: null, pedido_aberto: null,
      }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/planos/checkout/elolab-ultra?trial=1');
  const consent = page.getByLabel(/Autorizo a cobrança recorrente de/);
  await consent.check();
  await expect.poll(() => brickRequests).toBeGreaterThan(0);
  await expect(page.locator('#cardPaymentBrick_container')).toHaveCount(1);

  await page.getByRole('radio', { name: 'Pix' }).click();
  await page.getByRole('radio', { name: /Cartão de crédito/ }).click();

  await expect(page.getByLabel(/Autorizo a cobrança recorrente de/)).not.toBeChecked();
  await expect(page.getByRole('status')).toContainText(/Marque a autorização acima para carregar o formulário/);
  await expect(page.locator('#cardPaymentBrick_container')).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('novo checkout de plano mostra cartão e Pix, inclusive com query antiga de boleto', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page);
  await page.route('**/functions/v1/mercadopago-checkout', async (route) => {
    const request = route.request().postDataJSON() as { action?: string };
    if (request.action !== 'billing_status') {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Método não suportado no teste.' }) });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        public_key: null,
        sandbox: true,
        plano: {
          id: 'synthetic-plan',
          slug: 'elolab-max',
          nome: 'EloLab Max',
          descricao: null,
          valor: 10,
          frequencia: 'mensal',
          trial_dias: 0,
          features: [],
          periodo_meses: 1,
        },
        assinatura: null,
        pedido_aberto: null,
      }),
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/planos/checkout/elolab-max?metodo=boleto');

  const methods = page.getByRole('radiogroup', { name: 'Forma de pagamento' });
  await expect(methods.getByRole('radio')).toHaveCount(2);
  await expect(methods.getByRole('radio', { name: /Cartão de crédito/ })).toBeVisible();
  await expect(methods.getByRole('radio', { name: 'Pix' })).toBeVisible();
  await expect(methods.getByRole('radio', { name: 'Boleto' })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('checkout Pix preenche nome e documento do perfil e explica os dados enviados', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page);
  await page.route('**/functions/v1/mercadopago-checkout', async (route) => {
    const request = route.request().postDataJSON() as { action?: string };
    if (request.action !== 'billing_status') {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Método não suportado no teste.' }) });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        public_key: null,
        sandbox: true,
        plano: {
          id: 'synthetic-plan', slug: 'elolab-max', nome: 'EloLab Max', descricao: null,
          valor: 10, frequencia: 'mensal', trial_dias: 0, features: [], periodo_meses: 1,
        },
        assinatura: null,
        pedido_aberto: null,
      }),
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/planos/checkout/elolab-max?metodo=pix');

  await expect(page.getByRole('textbox', { name: 'Nome', exact: true })).toHaveValue('Conta');
  await expect(page.getByLabel('Sobrenome')).toHaveValue('QA sintética');
  await expect(page.getByLabel('CPF ou CNPJ')).toHaveValue('529.982.247-25');
  await expect(page.getByText(/inclusive o endereço, acompanham os dados do pagador enviados ao Mercado Pago/)).toBeVisible();
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('checkout deixa explícito quando a tentativa de teste não é elegível', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page);
  await page.route('**/functions/v1/mercadopago-checkout', async (route) => {
    const request = route.request().postDataJSON() as { action?: string };
    if (request.action !== 'billing_status') {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Método não suportado no teste.' }) });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        public_key: null,
        sandbox: true,
        plano: {
          id: 'synthetic-plan', slug: 'elolab-max', nome: 'EloLab Max', descricao: null,
          valor: 379, frequencia: 'mensal', trial_dias: 3, features: [], periodo_meses: 1,
        },
        assinatura: null,
        pedido_aberto: null,
      }),
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/planos/checkout/elolab-max?trial=1');

  const trialWarning = page.getByRole('alert').filter({ hasText: 'Esta conta não está elegível ao teste grátis' });
  await expect(trialWarning).toContainText('Esta conta não está elegível ao teste grátis');
  await expect(trialWarning).toContainText(/R\$\s*379,00 será cobrado hoje/);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('checkout adia a primeira cobrança no cartão até terminar o Pix pré-pago vigente', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page);
  await page.route('**/functions/v1/mercadopago-checkout', async (route) => {
    const request = route.request().postDataJSON() as { action?: string };
    if (request.action !== 'billing_status') {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Método não suportado no teste.' }) });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        public_key: null,
        sandbox: true,
        trial_elegivel: false,
        plano: {
          id: 'synthetic-plan', slug: 'elolab-max', nome: 'EloLab Max', descricao: null,
          valor: 379, frequencia: 'mensal', trial_dias: 0, features: [], periodo_meses: 1,
        },
        assinatura: {
          plano_slug: 'elolab-max', status: 'ativa', em_trial: false,
          trial_fim: null, data_fim: '2026-11-13T00:00:00.000Z', modalidade: 'pre_pago',
        },
        pedido_aberto: null,
      }),
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/planos/checkout/elolab-max');

  await expect(page.getByText('Total hoje')).toBeVisible();
  await expect(page.getByText('R$ 0,00')).toBeVisible();
  await expect(page.getByText('A primeira cobrança será em 13/11/2026. Depois, R$ 379,00/mês no cartão até você cancelar.')).toBeVisible();
  await expect(page.getByText('R$ 379,00/mês', { exact: true })).toBeVisible();
  await expect(page.getByText(/R\$\s*379,00\/1 mês/i)).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('ignora Pix solicitado por URL quando já existe recorrência ativa', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page);
  await page.route('**/functions/v1/mercadopago-checkout', async (route) => {
    const request = route.request().postDataJSON() as { action?: string };
    if (request.action !== 'billing_status') {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Ação não esperada.' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        public_key: null,
        sandbox: true,
        trial_elegivel: false,
        plano: { id: 'synthetic-plan', slug: 'elolab-max', nome: 'EloLab Pro', descricao: null, valor: 379, frequencia: 'mensal', trial_dias: 3, features: [], periodo_meses: 1 },
        assinatura: { plano_slug: 'elolab-max', status: 'ativa', em_trial: false, trial_fim: null, data_fim: null, modalidade: 'recorrente' },
        pedido_aberto: null,
      }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/planos/checkout/elolab-max?metodo=pix');

  const methods = page.getByRole('radiogroup', { name: 'Forma de pagamento' });
  await expect(methods.getByRole('radio', { name: /Cartão de crédito/ })).toBeChecked();
  await expect(methods.getByRole('radio', { name: 'Pix' })).toBeDisabled();
  await expect(page.getByText('Cartão indisponível neste momento')).toBeVisible();
  await expect(page.getByText(/chave pública do mercado pago/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /gerar pix/i })).toHaveCount(0);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});

test('avisa antes que escolher Pix cancela o teste grátis solicitado', async ({ page }) => {
  const synthetic = await installSyntheticClinic(page);
  await page.route('https://sdk.mercadopago.com/**', (route) => route.abort());
  await page.route('**/functions/v1/mercadopago-checkout', async (route) => {
    const request = route.request().postDataJSON() as { action?: string };
    if (request.action !== 'billing_status') {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Ação não esperada.' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        public_key: 'TEST-00000000-0000-0000-0000-000000000000',
        sandbox: true,
        trial_elegivel: true,
        plano: { id: 'synthetic-plan', slug: 'elolab-ultra', nome: 'EloLab Ultra', descricao: null, valor: 499, frequencia: 'mensal', trial_dias: 3, features: [], periodo_meses: 1 },
        assinatura: null,
        pedido_aberto: null,
      }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/planos/checkout/elolab-ultra?trial=1');
  await page.getByRole('radio', { name: 'Pix' }).click();

  await expect(page.getByRole('alert')).toContainText(/o teste grátis não se aplica ao pix/i);
  const totalRow = page.getByText('Total hoje').locator('..');
  await expect(totalRow).toContainText('R$ 499,00');
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
});
