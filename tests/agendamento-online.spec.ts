import { test, expect } from '@playwright/test';

test.describe('Agendamento online', () => {
  test('conclui o pedido de consulta depois do consentimento do paciente', async ({ page }) => {
    let pedidoEnviado: Record<string, unknown> | undefined;

    await page.route('**/functions/v1/public-booking', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'info') {
        await route.fulfill({ json: {
          clinica: { nome: 'Clínica de teste' },
          mensagem: 'Agende sua consulta online.',
          dias_antecedencia: 5,
          medicos: [{ id: 'medico-1', nome: 'Dra. Ana', especialidade: 'Clínica geral' }],
        } });
      } else if (body.action === 'slots') {
        await route.fulfill({ json: { slots: ['10:30', '11:00'] } });
      } else if (body.action === 'book') {
        pedidoEnviado = body;
        await route.fulfill({ json: {
          success: true,
          message: 'Pedido de agendamento enviado! A clínica vai entrar em contato para confirmar.',
        } });
      }
    });

    await page.goto('/agendar/00000000-0000-4000-8000-000000000001');
    await page.getByRole('button', { name: /Dra\. Ana/ }).click();
    await page.locator('button').filter({ has: page.locator('span.uppercase') }).nth(0).click();
    await page.getByRole('button', { name: /10:30/ }).click();

    await page.getByLabel('Nome completo *').fill('Mariana da Silva');
    await page.getByLabel('CPF *').fill('123');
    await page.getByLabel('Celular / WhatsApp *').fill('119');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Solicitar agendamento' }).click();

    await expect(page.getByRole('alert')).toHaveText('CPF inválido. Confira os números digitados.');
    await expect(page.locator('#ag-cpf')).toBeFocused();
    expect(pedidoEnviado).toBeUndefined();

    await page.getByLabel('CPF *').fill('52998224725');
    await page.getByRole('button', { name: 'Solicitar agendamento' }).click();
    await expect(page.getByRole('alert')).toHaveText('Informe um telefone com DDD.');
    await expect(page.locator('#ag-tel')).toBeFocused();
    expect(pedidoEnviado).toBeUndefined();

    await page.getByLabel('Celular / WhatsApp *').fill('11987654321');
    await page.getByRole('button', { name: 'Solicitar agendamento' }).click();

    await expect(page.getByText(/Pedido de agendamento enviado/)).toBeVisible();
    await expect(page.getByRole('status')).toBeFocused();
    await expect(page.getByText(/Dra\. Ana/)).toBeVisible();
    expect(pedidoEnviado).toMatchObject({
      action: 'book',
      medico_id: 'medico-1',
      hora: '10:30',
      nome: 'Mariana da Silva',
      cpf: '529.982.247-25',
      aceite_lgpd: true,
    });
  });

  test('atualiza horários após conflito e limpa a mensagem ao escolher outra opção', async ({ page }) => {
    let chamadasDeHorario = 0;
    let chamadasDeReserva = 0;
    let ultimoPedido: Record<string, unknown> | undefined;

    await page.route('**/functions/v1/public-booking', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'info') {
        await route.fulfill({ json: {
          clinica: { nome: 'Clínica de teste' }, mensagem: null, dias_antecedencia: 5,
          medicos: [{ id: 'medico-1', nome: 'Dra. Ana', especialidade: null }],
        } });
      } else if (body.action === 'slots') {
        chamadasDeHorario += 1;
        await route.fulfill({ json: { slots: chamadasDeHorario === 1 ? ['10:30', '11:00'] : ['11:00'] } });
      } else if (body.action === 'book') {
        chamadasDeReserva += 1;
        ultimoPedido = body;
        if (chamadasDeReserva === 1) {
          await route.fulfill({ status: 409, json: { error: 'Este horário acabou de ser ocupado. Escolha outro.', code: 'slot_unavailable' } });
        } else {
          await route.fulfill({ json: { success: true, message: 'Pedido recebido para confirmação.' } });
        }
      }
    });

    await page.goto('/agendar/00000000-0000-4000-8000-000000000001');
    await page.getByRole('button', { name: /Dra\. Ana/ }).click();
    await page.locator('button').filter({ has: page.locator('span.uppercase') }).nth(0).click();
    await page.getByRole('button', { name: /10:30/ }).click();
    await page.getByLabel('Nome completo *').fill('Mariana da Silva');
    await page.getByLabel('CPF *').fill('52998224725');
    await page.getByLabel('Celular / WhatsApp *').fill('11987654321');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Solicitar agendamento' }).click();

    await expect(page.getByRole('alert')).toHaveText(/acabou de ser ocupado/);
    await expect(page.getByRole('button', { name: 'Solicitar agendamento' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /10:30/ })).toHaveCount(0);
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(page.getByRole('button', { name: /11:00/ })).toBeVisible();
    await page.getByRole('button', { name: /11:00/ }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Solicitar agendamento' }).click();

    await expect(page.getByText('Pedido recebido para confirmação.')).toBeVisible();
    expect(chamadasDeReserva).toBe(2);
    expect(ultimoPedido).toMatchObject({ action: 'book', hora: '11:00' });
  });

  test('permite escolher dias além das três primeiras semanas configuradas', async ({ page }) => {
    let dataConsultada = '';
    await page.route('**/functions/v1/public-booking', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'info') {
        await route.fulfill({ json: {
          clinica: { nome: 'Clínica de teste' }, mensagem: null, dias_antecedencia: 60,
          medicos: [{ id: 'medico-1', nome: 'Dra. Ana', especialidade: null }],
        } });
      } else if (body.action === 'slots') {
        dataConsultada = body.data;
        await route.fulfill({ json: { slots: ['15:30'] } });
      } else {
        await route.fulfill({ json: { success: true } });
      }
    });

    const diaEsperado = await page.evaluate(() => {
      const dia = new Date();
      dia.setDate(dia.getDate() + 28);
      return `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
    });

    await page.goto('/agendar/00000000-0000-4000-8000-000000000001');
    await page.getByRole('button', { name: /Dra\. Ana/ }).click();
    const diasVisiveis = page.getByTestId('online-booking-day');
    await expect(diasVisiveis).toHaveCount(14);
    await expect(diasVisiveis.nth(13)).toBeInViewport();
    expect(await page.getByTestId('online-booking-days').evaluate((el) => el.scrollWidth === el.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Próximos dias' }).click();
    await page.getByRole('button', { name: 'Próximos dias' }).click();
    await expect(page.getByText('Dias 29–42 de 61')).toBeVisible();
    await page.locator('button').filter({ has: page.locator('span.uppercase') }).nth(0).click();

    await expect(page.getByRole('button', { name: /15:30/ })).toBeVisible();
    expect(dataConsultada).toBe(diaEsperado);
  });

  test('limpa o dia e horário selecionados ao mudar de página', async ({ page }) => {
    await page.route('**/functions/v1/public-booking', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'info') {
        await route.fulfill({ json: {
          clinica: { nome: 'Clínica de teste' }, mensagem: null, dias_antecedencia: 45,
          medicos: [{ id: 'medico-1', nome: 'Dra. Ana', especialidade: null }],
        } });
      } else if (body.action === 'slots') {
        await route.fulfill({ json: { slots: ['10:30'] } });
      } else {
        await route.fulfill({ json: { success: true } });
      }
    });

    await page.goto('/agendar/00000000-0000-4000-8000-000000000001');
    await page.getByRole('button', { name: /Dra\. Ana/ }).click();
    await page.getByTestId('online-booking-day').nth(0).click();
    await page.getByRole('button', { name: /10:30/ }).click();
    await expect(page.getByRole('button', { name: 'Solicitar agendamento' })).toBeVisible();

    await page.getByRole('button', { name: 'Próximos dias' }).click();
    await expect(page.getByRole('button', { name: 'Solicitar agendamento' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /10:30/ })).toHaveCount(0);
    await expect(page.locator('[data-testid="online-booking-day"][aria-pressed="true"]')).toHaveCount(0);
  });

  test('usa a data de hoje informada pelo servidor da clínica', async ({ page }) => {
    let dataConsultada = '';
    await page.route('**/functions/v1/public-booking', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'info') {
        await route.fulfill({ json: {
          clinica: { nome: 'Clínica de teste' }, mensagem: null, dias_antecedencia: 5, hoje: '2026-01-01',
          medicos: [{ id: 'medico-1', nome: 'Dra. Ana', especialidade: null }],
        } });
      } else if (body.action === 'slots') {
        dataConsultada = body.data;
        await route.fulfill({ json: { slots: ['10:30'] } });
      } else {
        await route.fulfill({ json: { success: true } });
      }
    });

    await page.goto('/agendar/00000000-0000-4000-8000-000000000001');
    await page.getByRole('button', { name: /Dra\. Ana/ }).click();
    await page.locator('button').filter({ has: page.locator('span.uppercase') }).nth(0).click();

    await expect(page.getByRole('button', { name: /10:30/ })).toBeVisible();
    expect(dataConsultada).toBe('2026-01-01');
  });

  test('não troca os horários atuais quando uma busca anterior termina atrasada', async ({ page }) => {
    let primeiraBuscaIniciada!: () => void;
    const primeiraBusca = new Promise<void>((resolve) => { primeiraBuscaIniciada = resolve; });
    let liberarPrimeiraBusca!: () => void;
    const liberacaoPrimeiraBusca = new Promise<void>((resolve) => { liberarPrimeiraBusca = resolve; });
    let primeiraBuscaConcluida!: () => void;
    const primeiraRespostaConcluida = new Promise<void>((resolve) => { primeiraBuscaConcluida = resolve; });
    let chamadasDeHorario = 0;

    await page.route('**/functions/v1/public-booking', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'info') {
        await route.fulfill({ json: {
          clinica: { nome: 'Clínica de teste' },
          mensagem: null,
          dias_antecedencia: 5,
          medicos: [{ id: 'medico-1', nome: 'Dra. Ana', especialidade: 'Clínica geral' }],
        } });
        return;
      }

      if (body.action === 'slots') {
        chamadasDeHorario += 1;
        if (chamadasDeHorario === 1) {
          primeiraBuscaIniciada();
          await liberacaoPrimeiraBusca;
          await route.fulfill({ json: { slots: ['09:00'] } });
          primeiraBuscaConcluida();
        } else {
          await route.fulfill({ json: { slots: ['11:00'] } });
        }
        return;
      }

      await route.fulfill({ json: { success: true } });
    });

    await page.goto('/agendar/00000000-0000-4000-8000-000000000001');
    await page.getByRole('button', { name: /Dra\. Ana/ }).click();

    const dias = page.locator('button').filter({ has: page.locator('span.uppercase') });
    await dias.nth(0).click();
    await primeiraBusca;
    await dias.nth(1).click();

    await expect(page.getByRole('button', { name: /11:00/ })).toBeVisible();
    liberarPrimeiraBusca();
    await primeiraRespostaConcluida;
    await expect(page.getByRole('button', { name: /11:00/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /09:00/ })).toHaveCount(0);
  });

  test('permite recuperar falhas ao carregar a clínica e os horários', async ({ page }) => {
    let chamadasInfo = 0;
    let chamadasHorarios = 0;

    await page.route('**/functions/v1/public-booking', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'info') {
        chamadasInfo += 1;
        if (chamadasInfo <= 2) {
          await route.fulfill({ status: 503, json: { error: 'Falha temporária ao carregar a clínica.' } });
        } else {
          await route.fulfill({ json: {
            clinica: { nome: 'Clínica de teste' }, mensagem: null, dias_antecedencia: 3,
            medicos: [{ id: 'medico-1', nome: 'Dra. Ana', especialidade: null }],
          } });
        }
        return;
      }

      if (body.action === 'slots') {
        chamadasHorarios += 1;
        if (chamadasHorarios === 1) {
          await route.fulfill({ status: 503, json: { error: 'Falha temporária ao buscar horários.' } });
        } else {
          await route.fulfill({ json: { slots: ['10:30'] } });
        }
        return;
      }

      await route.fulfill({ json: { success: true } });
    });

    await page.goto('/agendar/00000000-0000-4000-8000-000000000001');
    await expect(page.getByRole('alert')).toHaveText(/Falha temporária ao carregar a clínica/);
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await page.getByRole('button', { name: /Dra\. Ana/ }).click();
    await page.locator('button').filter({ has: page.locator('span.uppercase') }).nth(0).click();

    await expect(page.getByRole('alert')).toContainText('Falha temporária ao buscar horários.');
    await expect(page.getByText('Sem horários livres neste dia. Tente outro.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Tentar buscar horários novamente' }).click();
    await expect(page.getByRole('button', { name: /10:30/ })).toBeVisible();
    expect(chamadasInfo).toBeGreaterThanOrEqual(3);
    expect(chamadasHorarios).toBe(2);
  });

  test('mostra as duas semanas completas sem rolagem lateral no celular', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.route('**/functions/v1/public-booking', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'info') {
        await route.fulfill({ json: {
          clinica: { nome: 'Clínica de teste' }, mensagem: null, dias_antecedencia: 30,
          medicos: [{ id: 'medico-1', nome: 'Dra. Ana', especialidade: 'Clínica geral' }],
        } });
      } else if (body.action === 'slots') {
        await route.fulfill({ json: { slots: ['10:30'] } });
      } else {
        await route.fulfill({ json: { success: true } });
      }
    });

    await page.goto('/agendar/00000000-0000-4000-8000-000000000001');
    await page.getByRole('button', { name: /Dra\. Ana/ }).click();

    const dias = page.getByTestId('online-booking-day');
    await expect(dias).toHaveCount(14);
    await expect(dias.nth(13)).toBeInViewport();
    expect(await page.getByTestId('online-booking-days').evaluate((el) => el.scrollWidth === el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
