import { describe, expect, it } from 'vitest';
import { mercadoPagoPaymentResource } from '../../../supabase/functions/_shared/mercadoPagoWebhookRouting';

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
