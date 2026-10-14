export function criarTokenConvidado(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function hashTokenConvidado(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function calcularExpiracaoAgendamento(data: string, inicio: string, fim: string | null, agora = Date.now()): Date | null {
  const hora = (valor: string) => valor.slice(0, 5);
  const inicioMs = Date.parse(`${data}T${hora(inicio)}:00-03:00`);
  const fimMs = Date.parse(`${data}T${hora(fim || inicio)}:00-03:00`);
  const expiresAt = new Date(fimMs + 30 * 60_000);
  if (!Number.isFinite(inicioMs) || !Number.isFinite(expiresAt.getTime()) ||
    inicioMs < agora - 30 * 60_000 || inicioMs > agora + 7 * 24 * 60 * 60_000 || expiresAt.getTime() <= agora) return null;
  return expiresAt;
}

export function validarSinalWebRtc(tipo: unknown, payload: unknown): { ok: boolean } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false };
  const value = payload as Record<string, unknown>;
  const keys = Object.keys(value);
  if (tipo === 'offer' || tipo === 'answer') {
    if (keys.length !== 2 || !keys.includes('type') || !keys.includes('sdp')) return { ok: false };
    return { ok: value.type === tipo && typeof value.sdp === 'string' && value.sdp.length > 0 && value.sdp.length <= 16_000 };
  }
  if (tipo === 'ice-candidate') {
    const allowed = ['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment'];
    if (keys.some((key) => !allowed.includes(key)) || !keys.includes('candidate')) return { ok: false };
    return { ok: typeof value.candidate === 'string' && value.candidate.length > 0 && value.candidate.length <= 2_048 &&
      (value.sdpMid === undefined || typeof value.sdpMid === 'string' && value.sdpMid.length <= 128) &&
      (value.sdpMLineIndex === undefined || Number.isInteger(value.sdpMLineIndex) && Number(value.sdpMLineIndex) >= 0 && Number(value.sdpMLineIndex) <= 32) &&
      (value.usernameFragment === undefined || typeof value.usernameFragment === 'string' && value.usernameFragment.length <= 256) };
  }
  return { ok: false };
}
