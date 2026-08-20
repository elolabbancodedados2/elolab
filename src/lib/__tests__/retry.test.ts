import { describe, expect, it, vi } from 'vitest';
import { withSafeRetry } from '../retry';

describe('withSafeRetry', () => {
  it('repete falha transitória e retorna o resultado', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 503 }))
      .mockResolvedValue('ok');
    await expect(withSafeRetry(operation, { baseDelayMs: 1 })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('não repete erro de validação', async () => {
    const operation = vi.fn().mockRejectedValue(Object.assign(new Error('inválido'), { status: 400 }));
    await expect(withSafeRetry(operation, { baseDelayMs: 1 })).rejects.toThrow('inválido');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

