import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { server } from '@/mocks/server';
import { beforeAll, afterEach, afterAll } from 'vitest';

// MSW server lifecycle
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  // Alguns ambientes do Vitest não ativam o auto-cleanup do Testing Library
  // quando os arquivos rodam no mesmo worker. Sem isto, o DOM de um teste
  // vazava para o seguinte e consultas simples encontravam elementos duplicados.
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
