import { describe, expect, it } from 'vitest';
import { mapAuthorizedPaymentInvoice } from '../../../supabase/functions/_shared/mercadoPagoInvoice';

describe('mapAuthorizedPaymentInvoice', () => {
  it('keeps invoice and nested payment statuses separate', () => {
    const row = mapAuthorizedPaymentInvoice({
      assinaturaMpId: 'gateway-row',
      userId: 'payer-user',
      now: '2026-10-08T12:00:00.000Z',
      authorizedPayment: {
        id: 123,
        preapproval_id: 'preapproval-456',
        status: 'processed',
        type: 'scheduled',
        transaction_amount: '399.00',
        currency_id: 'BRL',
        date_created: '2026-10-01T10:00:00-03:00',
        debit_date: '2026-10-05T10:00:00-03:00',
        retry_attempt: 2,
        payment: { id: 789, status: 'approved', status_detail: 'accredited' },
      },
    });

    expect(row).toMatchObject({
      assinatura_mp_id: 'gateway-row',
      user_id: 'payer-user',
      mp_authorized_payment_id: '123',
      mp_preapproval_id: 'preapproval-456',
      mp_payment_id: '789',
      invoice_status: 'processed',
      payment_status: 'approved',
      payment_status_detail: 'accredited',
      amount: 399,
      currency_id: 'BRL',
      invoice_type: 'scheduled',
      retry_attempt: 2,
      updated_at: '2026-10-08T12:00:00.000Z',
    });
    expect(row.date_created).toBe('2026-10-01T13:00:00.000Z');
    expect(row.debit_date).toBe('2026-10-05T13:00:00.000Z');
    expect(row).not.toHaveProperty('payment');
  });

  it('does not treat the invoice status as a nested payment status', () => {
    const row = mapAuthorizedPaymentInvoice({
      assinaturaMpId: 'gateway-row',
      userId: null,
      authorizedPayment: {
        id: 'invoice-1',
        preapproval_id: 'preapproval-1',
        status: 'scheduled',
      },
    });

    expect(row.invoice_status).toBe('scheduled');
    expect(row.payment_status).toBeNull();
    expect(row.mp_payment_id).toBeNull();
    expect(row.amount).toBeNull();
  });

  it('rejects invoice responses without stable Mercado Pago identifiers', () => {
    expect(() => mapAuthorizedPaymentInvoice({
      assinaturaMpId: 'gateway-row',
      userId: null,
      authorizedPayment: { id: 'invoice-1' },
    })).toThrow('Fatura sem identificador ou assinatura Mercado Pago');
  });
});
