import { expect, test } from '@playwright/test';
import { installSyntheticClinic } from './helpers/syntheticClinic';

test.use({ serviceWorkers: 'block' });

test('dois participantes consentem e estabelecem vídeo WebRTC com mídia sintética no Chromium', async ({ page, browser }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const synthetic = await installSyntheticClinic(page, { appOrigin, role: 'admin' });
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const syntheticGuest = await installSyntheticClinic(guest, { appOrigin, role: 'admin', authenticated: false });
  const token = 'G'.repeat(43);
  const sessionId = '00000000-0000-4000-8000-000000000091';
  const signals: Array<{ id: number; sender: string; signal_type: string; payload: unknown }> = [];
  let nextId = 1;
  let providerPresent = false;
  let guestPresent = false;
  let providerConsent = false;
  let guestConsent = false;

  for (const participantPage of [page, guest]) {
    await participantPage.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
        getUserMedia: async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 240;
          const context2d = canvas.getContext('2d')!;
          let frame = 0;
          const draw = () => {
            context2d.fillStyle = `hsl(${frame++ % 360} 65% 45%)`;
            context2d.fillRect(0, 0, canvas.width, canvas.height);
            requestAnimationFrame(draw);
          };
          draw();
          const stream = canvas.captureStream(12);
          const audio = new AudioContext();
          const oscillator = audio.createOscillator();
          const destination = audio.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
          return stream;
        },
      } });
    });
  }

  await page.route('**/functions/v1/teleconsulta', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const participant = body.guest_token === token ? 'guest' : 'provider';
    if (body.action === 'consent') {
      if (participant === 'guest') guestConsent = true;
      else providerConsent = true;
    }
    if (body.action === 'state') {
      if (participant === 'guest') guestPresent = true;
      else providerPresent = true;
    }
    if (body.action === 'signal') signals.push({ id: nextId++, sender: participant, signal_type: String(body.signal_type), payload: body.payload });
    const result = body.action === 'state'
      ? { status: providerConsent ? 'active' : 'waiting', expires_at: new Date(Date.now() + 60_000).toISOString(), provider_present: providerPresent, guest_present: guestPresent }
      : body.action === 'poll'
        ? { signals: signals.filter((signal) => signal.sender !== participant) }
        : { ok: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  await guest.route('**/functions/v1/teleconsulta', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const participant = body.guest_token === token ? 'guest' : 'provider';
    if (body.action === 'consent') {
      if (participant === 'guest') guestConsent = true;
      else providerConsent = true;
    }
    if (body.action === 'state') {
      if (participant === 'guest') guestPresent = true;
      else providerPresent = true;
    }
    if (body.action === 'signal') signals.push({ id: nextId++, sender: participant, signal_type: String(body.signal_type), payload: body.payload });
    const result = body.action === 'state'
      ? { status: providerConsent ? 'active' : 'waiting', expires_at: new Date(Date.now() + 60_000).toISOString(), provider_present: providerPresent, guest_present: guestPresent }
      : body.action === 'poll'
        ? { signals: signals.filter((signal) => signal.sender !== participant) }
        : { ok: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });

  await page.goto(`/teleconsulta/${sessionId}`);
  await expect(page.getByRole('heading', { name: 'Preparar sala de atendimento' })).toBeVisible();
  await page.getByRole('checkbox', { name: /entendi como funciona/i }).check();
  await page.getByRole('button', { name: 'Aceitar e entrar' }).click();

  await guest.goto(`/teleconsulta/${sessionId}#${token}`);
  await expect(guest.getByRole('heading', { name: 'Entrar na sala de espera' })).toBeVisible();
  await expect(guest).toHaveURL(new RegExp(`/teleconsulta/${sessionId}$`));
  await guest.getByRole('checkbox', { name: /entendi como funciona/i }).check();
  await guest.getByRole('button', { name: 'Aceitar e entrar' }).click();

  await expect(page.getByText('Chamada conectada')).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByText('Chamada conectada')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => signals.some((signal) => signal.signal_type === 'offer')).toBe(true);
  await expect.poll(() => signals.some((signal) => signal.signal_type === 'answer')).toBe(true);
  await page.getByRole('button', { name: 'Reconectar' }).click();
  await expect.poll(() => signals.filter((signal) => signal.signal_type === 'offer').length).toBeGreaterThan(1);
  await expect.poll(() => signals.filter((signal) => signal.signal_type === 'answer').length).toBeGreaterThan(1);
  await expect(page.getByText('Chamada conectada')).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByText('Chamada conectada')).toBeVisible({ timeout: 20_000 });
  expect(providerConsent).toBe(true);
  expect(guestConsent).toBe(true);
  expect(synthetic.assertAllWritesAreMocked()).toBe(true);
  expect(syntheticGuest.assertAllWritesAreMocked()).toBe(true);
  await guestContext.close();
});
