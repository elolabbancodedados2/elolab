import type { Page } from '@playwright/test';

/** Mantém a landing isolada do Supabase no ambiente E2E, que usa uma chave falsa. */
export async function mockPlanosPublicos(page: Page) {
  await page.route(/\/rest\/v1\/planos(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    }),
  );
}
