import { checarRateLimit } from './rateLimit.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Esperado ${String(expected)}, recebido ${String(actual)}`);
}

function client(data: unknown, error: { message: string } | null = null) {
  return { rpc: async () => ({ data, error }) } as never;
}

Deno.test('rate limit permite quando RPC retorna verdadeiro', async () => {
  assertEquals(await checarRateLimit(client(true), { chave: 'synthetic', limite: 5 }), false);
});

Deno.test('rate limit rejeita quando RPC indica limite excedido', async () => {
  assertEquals(await checarRateLimit(client(false), { chave: 'synthetic', limite: 5 }), true);
});

Deno.test('falha aberta permanece disponível somente como opção explícita padrão', async () => {
  assertEquals(await checarRateLimit(client(null, { message: 'unavailable' }), { chave: 'synthetic', limite: 5 }), false);
});

Deno.test('falha fechada interrompe chamada protegida se RPC falhar', async () => {
  try {
    await checarRateLimit(client(null, { message: 'unavailable' }), { chave: 'synthetic', limite: 5, failClosed: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Rate limit indisponível')) return;
    throw error;
  }
  throw new Error('Uma falha do rate limit permitiu que o endpoint protegido continuasse.');
});
