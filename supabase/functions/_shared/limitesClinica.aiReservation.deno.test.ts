import {
  decidirAcoesFalhaIa,
  estimarTokensEntradaConservador,
  liberarReservaTokensIa,
  liquidarReservaTokensIa,
  reservarTokensIa,
} from './limitesClinica.ts';

Deno.test('provider success keeps failed-settlement reservations and skips zero-token failure rows', () => {
  const settlementFailure = decidirAcoesFalhaIa(true, true);
  if (settlementFailure.liberarReserva || settlementFailure.registrarUsoFalho) {
    throw new Error('A successful provider call must preserve its pending reservation and avoid zero-token failure usage.');
  }

  const laterLogFailure = decidirAcoesFalhaIa(true, false);
  if (laterLogFailure.liberarReserva || laterLogFailure.registrarUsoFalho) {
    throw new Error('A post-settlement failure must not add a contradictory failed-usage row.');
  }

  const providerFailure = decidirAcoesFalhaIa(false, true);
  if (!providerFailure.liberarReserva || !providerFailure.registrarUsoFalho) {
    throw new Error('A provider failure must release its reservation and record the failed attempt.');
  }
});

Deno.test('settled usage keeps the reservation month across UTC month rollover', async () => {
  const migration = await Deno.readTextFile(new URL('../../migrations/20261013120000_atomic_ai_token_reservations.sql', import.meta.url));
  const insert = migration.match(/INSERT INTO public\.platform_ai_usage \(([\s\S]*?)\) VALUES \(([\s\S]*?)\);/i);
  if (!insert || !/\bcreated_at\b/i.test(insert[1]) || !/v_reservation\.created_at/i.test(insert[2])) {
    throw new Error('Successful usage must use the reservation timestamp so a request crossing UTC month-end stays in its reserved quota month.');
  }
});

function syntheticService(limit: number, initiallyUsed = 0, failSettlement = false) {
  let used = initiallyUsed;
  let nextId = 1;
  const pending = new Map<string, number>();
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    pending,
    get used() { return used; },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'platform_ai_reserve_tokens') {
        const amount = Number(args.p_tokens_reservados);
        const reserved = [...pending.values()].reduce((sum, item) => sum + item, 0);
        if (used + reserved + amount > limit) {
          return { data: { accepted: false, reservation_id: null, used: used + reserved, limit }, error: null };
        }
        const id = `reservation-${nextId++}`;
        pending.set(id, amount);
        return { data: { accepted: true, reservation_id: id, used: used + reserved, limit }, error: null };
      }
      if (name === 'platform_ai_settle_tokens') {
        const id = String(args.p_reservation_id);
        if (failSettlement) return { data: null, error: { message: 'synthetic settlement failure' } };
        if (!pending.has(id)) return { data: null, error: { message: 'unknown reservation' } };
        used += Number(args.p_input_tokens) + Number(args.p_output_tokens);
        pending.delete(id);
        return { data: null, error: null };
      }
      if (name === 'platform_ai_release_tokens') {
        const id = String(args.p_reservation_id);
        if (!pending.has(id)) return { data: null, error: { message: 'unknown reservation' } };
        pending.delete(id);
        return { data: null, error: null };
      }
      return { data: null, error: { message: 'unexpected rpc' } };
    },
  };
}

Deno.test('atomic AI reservations admit only one concurrent request within the remaining quota', async () => {
  const service = syntheticService(100, 0);
  const results = await Promise.all([
    reservarTokensIa(service as never, 'clinic-a', 60, 500),
    reservarTokensIa(service as never, 'clinic-a', 60, 500),
  ]);
  if (results.filter((item) => item.aceita).length !== 1) throw new Error('Exactly one concurrent reservation should be accepted.');
  if (results.filter((item) => !item.aceita).length !== 1) throw new Error('The over-quota reservation should be denied.');
  if (service.calls[0].args.p_clinica_id !== 'clinic-a' || service.calls[0].args.p_limite_padrao !== 500) {
    throw new Error('Reservation must be scoped to the clinic and carry the configured default limit.');
  }
});

Deno.test('settling atomically replaces a reservation with actual usage', async () => {
  const service = syntheticService(100, 10);
  const reservation = await reservarTokensIa(service as never, 'clinic-a', 50, 500);
  if (!reservation.aceita || !reservation.reservaId) throw new Error('Expected reservation to be accepted.');
  await liquidarReservaTokensIa(service as never, {
    reservaId: reservation.reservaId,
    clinicaId: 'clinic-a',
    usuarioId: 'user-a',
    operacao: 'suggest_diagnosis',
    modelo: 'nvidia/test',
    inputTokens: 20,
    outputTokens: 15,
    duracaoMs: 120,
  });
  if (service.used !== 45 || service.pending.size !== 0) throw new Error('Settlement must account for actual tokens and release reserved tokens.');
  const settlement = service.calls.find((call) => call.name === 'platform_ai_settle_tokens');
  if (settlement?.args.p_clinica_id !== 'clinic-a' || settlement.args.p_input_tokens !== 20) {
    throw new Error('Settlement must retain tenant scope and actual usage.');
  }
});

Deno.test('settlement failure leaves the pending reservation available for quota accounting', async () => {
  const service = syntheticService(100, 0, true);
  const reservation = await reservarTokensIa(service as never, 'clinic-a', 50);
  if (!reservation.reservaId) throw new Error('Expected reservation to be accepted.');
  let rejected = false;
  try {
    await liquidarReservaTokensIa(service as never, {
      reservaId: reservation.reservaId,
      clinicaId: 'clinic-a',
      usuarioId: 'user-a',
      operacao: 'suggest_diagnosis',
      modelo: 'nvidia/test',
      inputTokens: 20,
      outputTokens: 15,
      duracaoMs: 120,
    });
  } catch {
    rejected = true;
  }
  if (!rejected || service.pending.get(reservation.reservaId) !== 50 || service.used !== 0) {
    throw new Error('Failed settlement must neither consume nor release the reservation.');
  }
});

Deno.test('failed provider calls can release their reservation for a later request', async () => {
  const service = syntheticService(50);
  const reservation = await reservarTokensIa(service as never, 'clinic-a', 45);
  if (!reservation.aceita || !reservation.reservaId) throw new Error('Expected reservation to be accepted.');
  await liberarReservaTokensIa(service as never, reservation.reservaId, 'clinic-a');
  const retry = await reservarTokensIa(service as never, 'clinic-a', 45);
  if (!retry.aceita || service.pending.size !== 1) throw new Error('Released capacity should be available to a retry.');
});

Deno.test('reservation wrapper reports RPC failures and input estimate includes overhead', async () => {
  const failing = { rpc: async () => ({ data: null, error: { message: 'synthetic failure' } }) } as never;
  let rejected = false;
  try {
    await reservarTokensIa(failing, 'clinic-a', 10);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('Reservation RPC failures must fail closed.');
  if (estimarTokensEntradaConservador('abc') < 256) throw new Error('Input estimate must include conservative framing overhead.');
});
