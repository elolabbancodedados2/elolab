/**
 * Servidores ICE da teleconsulta. Só STUN não atravessa NAT simétrico (redes
 * móveis e corporativas), então um TURN configurado entra junto.
 *
 * Origens, em ordem: o que a função `teleconsulta` devolver em `ice_servers`
 * (credenciais temporárias) e as variáveis VITE_TURN_URLS (separadas por
 * vírgula), VITE_TURN_USERNAME e VITE_TURN_CREDENTIAL.
 */

const STUN_PADRAO: RTCIceServer = { urls: 'stun:stun.l.google.com:19302' };

interface EnvTurn {
  VITE_TURN_URLS?: string;
  VITE_TURN_USERNAME?: string;
  VITE_TURN_CREDENTIAL?: string;
}

function servidoresValidos(valor: unknown): RTCIceServer[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is RTCIceServer => {
    if (!item || typeof item !== 'object') return false;
    const urls = (item as RTCIceServer).urls;
    const lista = Array.isArray(urls) ? urls : [urls];
    return lista.length > 0 && lista.every(url => typeof url === 'string' && /^(stun|turn|turns):/.test(url));
  });
}

export function iceServersTeleconsulta(env: EnvTurn, doServidor?: unknown): RTCIceServer[] {
  const servidor = servidoresValidos(doServidor);
  if (servidor.length) return [STUN_PADRAO, ...servidor];
  const urls = (env.VITE_TURN_URLS || '').split(',').map(url => url.trim()).filter(url => /^turns?:/.test(url));
  if (!urls.length) return [STUN_PADRAO];
  return [STUN_PADRAO, { urls, username: env.VITE_TURN_USERNAME || undefined, credential: env.VITE_TURN_CREDENTIAL || undefined }];
}
