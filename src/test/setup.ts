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

// jsdom não implementa IntersectionObserver; framer-motion (whileInView) e os
// textos animados da landing dependem dele. Tudo é considerado visível.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly thresholds: ReadonlyArray<number> = [0];
    private readonly callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) { this.callback = callback; }
    observe(target: Element) {
      this.callback([{ isIntersecting: true, target, intersectionRatio: 1, time: 0, boundingClientRect: target.getBoundingClientRect(), intersectionRect: target.getBoundingClientRect(), rootBounds: null } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  }
  globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

// O fundo animado (WebGL) não roda no jsdom; sem isto cada render loga
// "Not implemented: HTMLCanvasElement.prototype.getContext".
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
