import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  resetRateLimit,
  getRemainingAttempts,
} from '@/lib/rateLimiter';

describe('rateLimiter', () => {
  // Cada teste usa uma chave única para isolar do store global
  const k = (suffix: string) => `test-${Date.now()}-${suffix}-${Math.random()}`;

  describe('checkRateLimit', () => {
    it('permite primeira tentativa', () => {
      const key = k('first');
      const result = checkRateLimit(key, 'auth');
      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBe(0);
    });

    it('permite até 5 tentativas em auth (max=5)', () => {
      const key = k('five');
      for (let i = 0; i < 5; i++) {
        expect(checkRateLimit(key, 'auth').allowed).toBe(true);
      }
    });

    it('bloqueia 6ª tentativa em auth com retryAfterMs > 0', () => {
      const key = k('six');
      for (let i = 0; i < 5; i++) checkRateLimit(key, 'auth');
      const sixth = checkRateLimit(key, 'auth');
      expect(sixth.allowed).toBe(false);
      expect(sixth.retryAfterMs).toBeGreaterThan(0);
    });

    it('permite 3 tentativas em payment (max=3)', () => {
      const key = k('pay');
      for (let i = 0; i < 3; i++) {
        expect(checkRateLimit(key, 'payment').allowed).toBe(true);
      }
      expect(checkRateLimit(key, 'payment').allowed).toBe(false);
    });

    it('chaves diferentes têm contadores independentes', () => {
      const key1 = k('a');
      const key2 = k('b');
      for (let i = 0; i < 5; i++) checkRateLimit(key1, 'auth');
      // key1 está bloqueado, key2 deve estar limpo
      expect(checkRateLimit(key1, 'auth').allowed).toBe(false);
      expect(checkRateLimit(key2, 'auth').allowed).toBe(true);
    });
  });

  describe('resetRateLimit', () => {
    it('limpa contador após reset (volta a permitir)', () => {
      const key = k('reset');
      for (let i = 0; i < 5; i++) checkRateLimit(key, 'auth');
      expect(checkRateLimit(key, 'auth').allowed).toBe(false);

      resetRateLimit(key);

      expect(checkRateLimit(key, 'auth').allowed).toBe(true);
    });

    it('reset de chave inexistente não dá erro', () => {
      expect(() => resetRateLimit(k('inexistente'))).not.toThrow();
    });
  });

  describe('getRemainingAttempts', () => {
    it('retorna max para chave nunca usada', () => {
      expect(getRemainingAttempts(k('virgin'), 'auth')).toBe(5);
      expect(getRemainingAttempts(k('virgin'), 'payment')).toBe(3);
    });

    it('decrementa contador a cada tentativa', () => {
      const key = k('count');
      checkRateLimit(key, 'auth');
      expect(getRemainingAttempts(key, 'auth')).toBe(4);
      checkRateLimit(key, 'auth');
      expect(getRemainingAttempts(key, 'auth')).toBe(3);
    });

    it('retorna 0 quando bloqueado', () => {
      const key = k('zero');
      for (let i = 0; i < 5; i++) checkRateLimit(key, 'auth');
      expect(getRemainingAttempts(key, 'auth')).toBe(0);
    });
  });
});
