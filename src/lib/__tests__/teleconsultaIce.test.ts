import { describe, expect, it } from 'vitest';
import { iceServersTeleconsulta } from '@/lib/teleconsultaIce';

describe('servidores ICE da teleconsulta', () => {
  it('sem TURN configurado usa só o STUN', () => {
    expect(iceServersTeleconsulta({})).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
  });

  it('inclui o TURN das variáveis de ambiente', () => {
    const servidores = iceServersTeleconsulta({
      VITE_TURN_URLS: 'turn:turn.exemplo.com:3478, turns:turn.exemplo.com:5349, http://ignorado',
      VITE_TURN_USERNAME: 'usuario',
      VITE_TURN_CREDENTIAL: 'segredo',
    });
    expect(servidores[1]).toEqual({ urls: ['turn:turn.exemplo.com:3478', 'turns:turn.exemplo.com:5349'], username: 'usuario', credential: 'segredo' });
  });

  it('prefere as credenciais temporárias do servidor e descarta entradas inválidas', () => {
    const servidores = iceServersTeleconsulta(
      { VITE_TURN_URLS: 'turn:fixo.exemplo.com' },
      [{ urls: 'turn:temp.exemplo.com', username: 'u', credential: 'c' }, { urls: 'javascript:alert(1)' }, null],
    );
    expect(servidores).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:temp.exemplo.com', username: 'u', credential: 'c' },
    ]);
  });
});
