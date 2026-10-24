import { recursoDoPlanoLiberado } from './planEntitlement.ts';

function service(result: { data: unknown; error: unknown }) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  return {
    calls,
    rpc: async (fn: string, args: unknown) => { calls.push({ fn, args }); return result; },
  };
}

Deno.test('plan feature is released only when the server confirms it for the clinic', async () => {
  const granted = service({ data: true, error: null });
  if (!(await recursoDoPlanoLiberado(granted, 'clinic-1', 'agente_ia'))) throw new Error('Confirmed feature must be released.');
  const call = granted.calls[0];
  if (call?.fn !== 'clinica_recurso_plano_liberado') throw new Error('Must ask the database entitlement function.');
  const args = call.args as Record<string, unknown>;
  if (args.p_clinica_id !== 'clinic-1' || args.p_recurso !== 'agente_ia') throw new Error('Must pass clinic and feature.');

  if (await recursoDoPlanoLiberado(service({ data: false, error: null }), 'clinic-1', 'agente_ia')) {
    throw new Error('A denied feature must not be released.');
  }
  if (await recursoDoPlanoLiberado(service({ data: 'true', error: null }), 'clinic-1', 'agente_ia')) {
    throw new Error('Only a boolean true releases the feature.');
  }
});

Deno.test('entitlement check fails closed when the database cannot answer', async () => {
  let threw = false;
  try {
    await recursoDoPlanoLiberado(service({ data: null, error: { message: 'boom' } }), 'clinic-1', 'agente_ia');
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('A failed entitlement check must not silently release or deny without signalling.');
});
