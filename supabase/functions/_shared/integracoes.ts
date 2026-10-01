/**
 * Credenciais de integração por clínica (tabela `integracoes_clinica`).
 *
 * Cifra AES-GCM de 256 bits com a chave INTEGRACOES_CHAVE_CRIPTO (32 bytes em
 * base64), que existe só nas variáveis de ambiente das edge functions. O valor
 * gravado é base64(iv de 12 bytes || ciphertext). Gerar a chave com:
 *
 *   openssl rand -base64 32
 *
 * Trocar a chave invalida as credenciais salvas: as clínicas precisam
 * reconectar.
 *
 * Toda função que fala com um fornecedor em nome de uma clínica deve usar
 * `credencialDaClinica` — nunca ler a tabela direto nem devolver o segredo ao
 * navegador.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

function b64ParaBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesParaB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

let chaveCache: CryptoKey | null = null;

async function chave(): Promise<CryptoKey> {
  if (chaveCache) return chaveCache;
  const bruta = Deno.env.get('INTEGRACOES_CHAVE_CRIPTO');
  if (!bruta) throw new Error('INTEGRACOES_CHAVE_CRIPTO não configurada no servidor.');
  const bytes = b64ParaBytes(bruta);
  if (bytes.length !== 32) throw new Error('INTEGRACOES_CHAVE_CRIPTO precisa ter 32 bytes (openssl rand -base64 32).');
  chaveCache = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return chaveCache;
}

export async function cifrar(texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chave(), new TextEncoder().encode(texto)));
  const saida = new Uint8Array(iv.length + cifrado.length);
  saida.set(iv);
  saida.set(cifrado, iv.length);
  return bytesParaB64(saida);
}

export async function decifrar(b64: string): Promise<string> {
  const bytes = b64ParaBytes(b64);
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await chave(), bytes.slice(12));
  return new TextDecoder().decode(claro);
}

/** Últimos 4 caracteres, para o admin reconhecer a credencial sem vê-la. */
export function dicaDoSegredo(segredo: string): string {
  const limpo = segredo.trim();
  return limpo.length <= 4 ? '••••' : `••••${limpo.slice(-4)}`;
}

export interface CredencialClinica {
  status: string;
  config: Record<string, unknown>;
  segredo: string | null;
}

/**
 * Credencial de uma clínica (ou de um profissional dela, via `referenciaId`)
 * para chamar o fornecedor. Devolve null se não houver integração conectada.
 * Exige client com service role.
 */
export async function credencialDaClinica(
  service: SupabaseClient,
  clinicaId: string,
  provedor: string,
  referenciaId: string | null = null,
): Promise<CredencialClinica | null> {
  let q = service.from('integracoes_clinica')
    .select('status, config, segredo_cifrado')
    .eq('clinica_id', clinicaId)
    .eq('provedor', provedor);
  q = referenciaId ? q.eq('referencia_id', referenciaId) : q.is('referencia_id', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data || data.status === 'desconectado') return null;
  return {
    status: data.status,
    config: (data.config ?? {}) as Record<string, unknown>,
    segredo: data.segredo_cifrado ? await decifrar(data.segredo_cifrado) : null,
  };
}

/** Registra falha/sucesso da última chamada ao fornecedor (aparece na tela). */
export async function registrarResultado(
  service: SupabaseClient,
  clinicaId: string,
  provedor: string,
  erro: string | null,
  referenciaId: string | null = null,
) {
  let q = service.from('integracoes_clinica').update({
    status: erro ? 'erro' : 'conectado',
    ultimo_erro: erro ? erro.slice(0, 500) : null,
    ultimo_teste_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('clinica_id', clinicaId).eq('provedor', provedor);
  q = referenciaId ? q.eq('referencia_id', referenciaId) : q.is('referencia_id', null);
  const { error } = await q;
  if (error) console.error('[integracoes] falha ao registrar resultado:', error.message);
}
