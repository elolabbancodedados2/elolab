import { agoraEmBrasilia, horarioConsultaPassou } from './horarios.ts';

Deno.test('uses the Brasília date after UTC has crossed into the next day', () => {
  const now = agoraEmBrasilia(new Date('2026-10-02T00:30:00.000Z'));
  if (now.data !== '2026-10-01' || now.minutos !== 21 * 60 + 30) {
    throw new Error(`Expected 2026-10-01 21:30 in Brasília; got ${now.data} ${now.minutos}`);
  }
});

Deno.test('advances to the next Brasília date at local midnight', () => {
  const now = agoraEmBrasilia(new Date('2026-10-02T03:00:00.000Z'));
  if (now.data !== '2026-10-02' || now.minutos !== 0) {
    throw new Error(`Expected 2026-10-02 00:00 in Brasília; got ${now.data} ${now.minutos}`);
  }
});

Deno.test('treats a same-day consultation as past only after its Brasília start time', () => {
  const now = new Date('2026-10-02T00:30:00.000Z'); // 21:30 in Brasília
  if (!horarioConsultaPassou('2026-10-01', '21:00', now)) {
    throw new Error('Expected a 21:00 consultation to be past at 21:30 Brasília time');
  }
  if (horarioConsultaPassou('2026-10-01', '22:00', now)) {
    throw new Error('Expected a 22:00 consultation to remain actionable at 21:30 Brasília time');
  }
  if (horarioConsultaPassou('2026-10-01', '', now)) {
    throw new Error('A legacy consultation without a stored time should remain actionable on its date');
  }
});
