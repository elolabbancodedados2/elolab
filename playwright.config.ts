import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Escape hatch para máquinas onde o download do browser do Playwright
        // falha (CDN bloqueada, proxy corporativo). Sem isto a suíte inteira
        // morre em milissegundos com "Executable doesn't exist" — 46 testes
        // vermelhos que não têm nada a ver com o código do app, o que faz a
        // pessoa duvidar do resultado em vez de duvidar do ambiente.
        //
        // Uso: PLAYWRIGHT_CHROMIUM_PATH=/caminho/para/chrome.exe npm run test:e2e
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --mode test',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
  },
});
