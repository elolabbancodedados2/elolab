import { describe, expect, it } from 'vitest';
import {
  buildSignatureManifest,
  isValidMercadoPagoSignature,
  parseSignatureHeader,
  signMercadoPagoNotification,
} from '../../../supabase/functions/_shared/mercadoPagoSignature';

const secret = 'segredo-de-teste';

async function hmacIndependente(key: string, message: string) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('assinatura dos webhooks do Mercado Pago', () => {
  it('monta o manifest com data.id em minúsculas, como exige a doc de Orders', () => {
    expect(buildSignatureManifest('ORD01M28P44G5FG8RJPM579EH56FV', 'req-1', '1742505638683'))
      .toBe('id:ord01m28p44g5fg8rjpm579eh56fv;request-id:req-1;ts:1742505638683;');
  });

  it('omite partes ausentes do manifest', () => {
    expect(buildSignatureManifest('123', null, '10')).toBe('id:123;ts:10;');
  });

  it('confere com um HMAC calculado de forma independente', async () => {
    const manifest = 'id:ord01abc;request-id:req-9;ts:1700;';
    const v1 = await hmacIndependente(secret, manifest);
    await expect(isValidMercadoPagoSignature({
      xSignature: `ts=1700,v1=${v1}`,
      xRequestId: 'req-9',
      dataId: 'ORD01ABC',
      secret,
    })).resolves.toBe(true);
  });

  it('recusa assinatura adulterada, segredo errado ou cabeçalho ausente', async () => {
    const header = await signMercadoPagoNotification(secret, 'ORD1', 'req', '1');
    await expect(isValidMercadoPagoSignature({ xSignature: header, xRequestId: 'req', dataId: 'ORD2', secret })).resolves.toBe(false);
    await expect(isValidMercadoPagoSignature({ xSignature: header, xRequestId: 'outro', dataId: 'ORD1', secret })).resolves.toBe(false);
    await expect(isValidMercadoPagoSignature({ xSignature: header, xRequestId: 'req', dataId: 'ORD1', secret: 'x' })).resolves.toBe(false);
    await expect(isValidMercadoPagoSignature({ xSignature: null, xRequestId: 'req', dataId: 'ORD1', secret })).resolves.toBe(false);
    await expect(isValidMercadoPagoSignature({ xSignature: header, xRequestId: 'req', dataId: null, secret })).resolves.toBe(false);
  });

  it('lê ts e v1 do cabeçalho x-signature', () => {
    expect(parseSignatureHeader('ts=1742505638683,v1=abc')).toEqual({ ts: '1742505638683', v1: 'abc' });
    expect(parseSignatureHeader('v1=abc')).toBeNull();
  });
});
