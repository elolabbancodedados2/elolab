import { describe, expect, it } from 'vitest';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@/lib/authValidation';

// zod 4 com @hookform/resolvers 3 lançava ZodError no login em vez de mostrar o erro no campo.
describe('loginSchema com zodResolver', () => {
  it('devolve erro no campo em vez de lançar exceção', async () => {
    const resolver = zodResolver(loginSchema);
    const resultado = await resolver(
      { email: 'invalido', password: '' } as any,
      undefined,
      { fields: {}, shouldUseNativeValidation: false } as any,
    );
    expect(resultado.errors.email).toBeDefined();
  });
});
