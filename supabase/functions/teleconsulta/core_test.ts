import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { calcularExpiracaoAgendamento, criarTokenConvidado, hashTokenConvidado, validarSinalWebRtc } from './core.ts';

Deno.test('token de convidado é aleatório, opaco e armazenável somente como hash', async () => {
  const first = criarTokenConvidado();
  const second = criarTokenConvidado();
  assertEquals(first.length, 43);
  assert(/^[A-Za-z0-9_-]{43}$/.test(first));
  assertNotEquals(first, second);
  const hash = await hashTokenConvidado(first);
  assertEquals(hash.length, 64);
  assertNotEquals(hash, first);
});

Deno.test('calcula expiração para coluna TIME com e sem segundos e rejeita horários distantes', () => {
  const now = Date.parse('2026-10-14T12:00:00-03:00');
  const expiration = calcularExpiracaoAgendamento('2026-10-14', '13:30:00', '14:00:00', now);
  assertEquals(expiration?.toISOString(), '2026-10-14T17:30:00.000Z');
  assertEquals(calcularExpiracaoAgendamento('2026-10-14', '13:30', null, now)?.toISOString(), '2026-10-14T17:00:00.000Z');
  assertEquals(calcularExpiracaoAgendamento('2026-10-25', '13:30:00', null, now), null);
});

Deno.test('aceita somente offer, answer e ICE limitados para sinalização', () => {
  assert(validarSinalWebRtc('offer', { type: 'offer', sdp: 'v=0\r\n' }).ok);
  assert(validarSinalWebRtc('answer', { type: 'answer', sdp: 'v=0\r\n' }).ok);
  assert(validarSinalWebRtc('ice-candidate', { candidate: 'candidate:1 1 UDP 1 192.0.2.10 5000 typ host' }).ok);
  assertEquals(validarSinalWebRtc('offer', { type: 'offer', sdp: 'x'.repeat(20_000) }).ok, false);
  assertEquals(validarSinalWebRtc('answer', { type: 'offer', sdp: 'v=0' }).ok, false);
  assertEquals(validarSinalWebRtc('ice-candidate', { candidate: 'x', patient_name: 'Maria' }).ok, false);
  assertEquals(validarSinalWebRtc('presence', { joined: true }).ok, false);
});
