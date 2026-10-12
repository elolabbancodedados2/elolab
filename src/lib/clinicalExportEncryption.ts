const ITERACOES_PBKDF2 = 310_000;
const ALGORITMO = 'AES-GCM';

interface EnvelopeExportClinico {
  formato: 'elolab-clinical-export';
  versao: 1;
  tipo: 'application/json' | 'application/xml';
  nomeArquivo: string;
  kdf: 'PBKDF2-SHA-256';
  iteracoes: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

function paraBase64(bytes: Uint8Array): string {
  let binario = '';
  bytes.forEach(byte => { binario += String.fromCharCode(byte); });
  return btoa(binario);
}

function deBase64(value: string): Uint8Array {
  const binario = atob(value);
  return Uint8Array.from(binario, char => char.charCodeAt(0));
}

function paraBufferSource(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function dadosAutenticados(envelope: Pick<EnvelopeExportClinico, 'formato' | 'versao' | 'tipo' | 'nomeArquivo' | 'kdf' | 'iteracoes'>) {
  return new TextEncoder().encode(JSON.stringify({
    formato: envelope.formato, versao: envelope.versao, tipo: envelope.tipo,
    nomeArquivo: envelope.nomeArquivo, kdf: envelope.kdf, iteracoes: envelope.iteracoes,
  }));
}

async function derivarChave(senha: string, salt: Uint8Array, cryptoApi: Crypto, iteracoes: number) {
  const material = await cryptoApi.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  return cryptoApi.subtle.deriveKey(
    { name: 'PBKDF2', salt: paraBufferSource(salt), iterations: iteracoes, hash: 'SHA-256' },
    material,
    { name: ALGORITMO, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function criptografarExportClinico(
  conteudo: string,
  senha: string,
  cryptoApi: Crypto = globalThis.crypto,
  opcoes: { tipo?: 'application/json' | 'application/xml'; nomeArquivo?: string } = {},
): Promise<string> {
  if (senha.length < 12) throw new Error('A senha precisa ter pelo menos 12 caracteres.');
  if (!cryptoApi?.subtle || !cryptoApi.getRandomValues) throw new Error('Este navegador não oferece criptografia segura.');
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const chave = await derivarChave(senha, salt, cryptoApi, ITERACOES_PBKDF2);
  const envelope: EnvelopeExportClinico = {
    formato: 'elolab-clinical-export', versao: 1,
    tipo: opcoes.tipo || 'application/json', nomeArquivo: opcoes.nomeArquivo || 'prontuario',
    kdf: 'PBKDF2-SHA-256', iteracoes: ITERACOES_PBKDF2,
    salt: paraBase64(salt), iv: paraBase64(iv), ciphertext: '',
  };
  const cifrado = await cryptoApi.subtle.encrypt(
    { name: ALGORITMO, iv: paraBufferSource(iv), additionalData: dadosAutenticados(envelope) },
    chave, new TextEncoder().encode(conteudo),
  );
  envelope.ciphertext = paraBase64(new Uint8Array(cifrado));
  return JSON.stringify(envelope);
}

export async function descriptografarExportClinico(conteudo: string, senha: string, cryptoApi: Crypto = globalThis.crypto) {
  const envelope = JSON.parse(conteudo) as EnvelopeExportClinico;
  if (envelope.formato !== 'elolab-clinical-export' || envelope.versao !== 1
      || envelope.kdf !== 'PBKDF2-SHA-256' || !Number.isSafeInteger(envelope.iteracoes)
      || envelope.iteracoes < 100_000 || envelope.iteracoes > 1_000_000
      || !['application/json', 'application/xml'].includes(envelope.tipo)) {
    throw new Error('O arquivo não é uma exportação clínica protegida compatível.');
  }
  const chave = await derivarChave(senha, deBase64(envelope.salt), cryptoApi, envelope.iteracoes);
  const texto = await cryptoApi.subtle.decrypt(
    { name: ALGORITMO, iv: paraBufferSource(deBase64(envelope.iv)), additionalData: dadosAutenticados(envelope) },
    chave, paraBufferSource(deBase64(envelope.ciphertext)),
  );
  return { conteudo: new TextDecoder().decode(texto), tipo: envelope.tipo, nomeArquivo: envelope.nomeArquivo };
}
