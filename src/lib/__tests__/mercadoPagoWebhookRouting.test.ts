import { describe, expect, it } from 'vitest';
import { mercadoPagoPaymentResource, oauthRevocationSellerId, oauthRevocationTarget, resolveMercadoPagoWebhookDataId } from '../../../supabase/functions/_shared/mercadoPagoWebhookRouting';
import { isValidMercadoPagoSignature, signMercadoPagoNotification } from '../../../supabase/functions/_shared/mercadoPagoSignature';

describe('resolveMercadoPagoWebhookDataId', () => {
  it('uses the query resource id for external webhook verification', () => {
    expect(resolveMercadoPagoWebhookDataId('seller-query', 'seller-body', false)).toBe('seller-query');
  });

  it('does not fall back to an unsigned body id for external webhooks', () => {
    expect(resolveMercadoPagoWebhookDataId(null, 'seller-body', false)).toBe('');
  });

  it('allows an authenticated internal retry to use the logged payload id', () => {
    expect(resolveMercadoPagoWebhookDataId(null, 'seller-body', true)).toBe('seller-body');
  });
});

describe('mercadoPagoPaymentResource', () => {
  it.each([
    { type: 'payment', expected: 'payment' },
    { action: 'payment.created', expected: 'payment' },
    { action: 'payment.updated', expected: 'payment' },
    { type: 'subscription_authorized_payment', expected: 'authorized_payment' },
    { action: 'subscription_authorized_payment.updated', expected: 'authorized_payment' },
    { type: 'subscription_preapproval', expected: null },
    { type: 'unknown', action: 'unknown', expected: null },
  ])('routes $type/$action to $expected', ({ type, action, expected }) => {
    expect(mercadoPagoPaymentResource({ type, action })).toBe(expected);
  });
});

describe('oauthRevocationSellerId', () => {
  const legitimateEvent = { type: 'mp-connect', action: 'application.deauthorized', user_id: 123456789, data: { id: '123456789' } } as const;

  it('does not revoke from the signed resource ID alone because action and user_id are unsigned', () => {
    expect(oauthRevocationSellerId(legitimateEvent, '123456789')).toBeNull();
  });

  it('keeps a legitimate event eligible when an independent confirmation is bound to the seller', () => {
    expect(oauthRevocationSellerId(legitimateEvent, '123456789', '123456789')).toBe('123456789');
  });

  it('does not revoke when action is altered even though the signed manifest remains valid', async () => {
    const signedAuthorizedEvent = { ...legitimateEvent, action: 'application.authorized' };
    const alteredToDeauthorized = { ...signedAuthorizedEvent, action: 'application.deauthorized' };
    const xSignature = await signMercadoPagoNotification('test-secret', '123456789', 'request-1', '1700');

    await expect(isValidMercadoPagoSignature({
      xSignature,
      xRequestId: 'request-1',
      dataId: '123456789',
      secret: 'test-secret',
    })).resolves.toBe(true);
    expect(oauthRevocationTarget(alteredToDeauthorized, '123456789')).toBe('123456789');
    expect(oauthRevocationSellerId(alteredToDeauthorized, '123456789')).toBeNull();
  });

  it('does not revoke when user_id is altered even though the signed manifest remains valid', async () => {
    const alteredUserId = { ...legitimateEvent, user_id: 987654321 };
    const xSignature = await signMercadoPagoNotification('test-secret', '123456789', 'request-1', '1700');

    await expect(isValidMercadoPagoSignature({
      xSignature,
      xRequestId: 'request-1',
      dataId: '123456789',
      secret: 'test-secret',
    })).resolves.toBe(true);
    expect(oauthRevocationTarget(alteredUserId, '123456789')).toBeNull();
    expect(oauthRevocationSellerId(alteredUserId, '123456789', '123456789')).toBeNull();
  });

  it('does not let an authenticated internal retry turn its logged body into revocation proof', () => {
    const internalEvent = { ...legitimateEvent, data: { id: '123456789' } };

    expect(resolveMercadoPagoWebhookDataId(null, internalEvent.data.id, true)).toBe('123456789');
    expect(oauthRevocationSellerId(internalEvent, '123456789')).toBeNull();
  });

  it('keeps an exact replay deferred on every delivery without independent confirmation', () => {
    expect(oauthRevocationSellerId(legitimateEvent, '123456789')).toBeNull();
    expect(oauthRevocationSellerId(legitimateEvent, '123456789')).toBeNull();
  });

  it.each([
    [{ type: 'mp-connect', action: 'application.deauthorized', user_id: 222, data: { id: '111' } }, '111'],
    [{ type: 'mp-connect', action: 'application.deauthorized', user_id: 111, data: { id: '222' } }, '111'],
    [{ type: 'mp-connect', action: 'application.deauthorized', user_id: 111 }, '111'],
    [{ type: 'mp-connect', action: 'application.authorized', user_id: 111 }, '111'],
    [{ type: 'payment', action: 'application.deauthorized', user_id: 111 }, '111'],
    [{ type: 'mp-connect', action: 'application.deauthorized', user_id: 111 }, null],
  ] as const)('rejects an untrusted revocation target', (event, signedDataId) => {
    expect(oauthRevocationSellerId(event, signedDataId)).toBeNull();
  });
});
