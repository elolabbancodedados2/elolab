import { getOverdueRecurringInvoiceIds, hasOverdueRecurringInvoice, prepaidReminderMilestone } from './platformPlanDelinquency.ts';

const now = new Date('2026-10-13T12:00:00.000Z');

Deno.test('recurring invoice becomes overdue at 72 hours after its debit date', () => {
  const overdue = hasOverdueRecurringInvoice([
    { mp_preapproval_id: 'sub-1', payment_status: 'rejected', debit_date: '2026-10-10T12:00:00.000Z' },
  ], now);

  if (!overdue) throw new Error('Expected a rejected invoice at the 72-hour boundary to be overdue');
});

Deno.test('a recent unpaid invoice remains inside the 72-hour grace period', () => {
  const overdue = hasOverdueRecurringInvoice([
    { mp_preapproval_id: 'sub-1', payment_status: 'pending', debit_date: '2026-10-10T12:00:00.001Z' },
  ], now);

  if (overdue) throw new Error('Expected an invoice younger than 72 hours not to be overdue');
});

Deno.test('a later approved invoice clears an older failed invoice', () => {
  const overdue = hasOverdueRecurringInvoice([
    { mp_preapproval_id: 'sub-1', payment_status: 'rejected', debit_date: '2026-10-01T12:00:00.000Z' },
    { mp_preapproval_id: 'sub-1', payment_status: 'approved', debit_date: '2026-10-12T12:00:00.000Z' },
  ], now);

  if (overdue) throw new Error('Expected a later approved invoice to restore good standing');
});

Deno.test('an approved invoice for another recurring subscription does not clear the debt', () => {
  const overdue = hasOverdueRecurringInvoice([
    { mp_preapproval_id: 'sub-1', payment_status: 'rejected', debit_date: '2026-10-01T12:00:00.000Z' },
    { mp_preapproval_id: 'sub-2', payment_status: 'approved', debit_date: '2026-10-12T12:00:00.000Z' },
  ], now);

  if (!overdue) throw new Error('Expected an unrelated subscription payment not to clear this debt');
});

Deno.test('missing dates or payment status do not block access', () => {
  const overdue = hasOverdueRecurringInvoice([
    { mp_preapproval_id: 'sub-1', payment_status: 'rejected', debit_date: null, date_created: null },
    { mp_preapproval_id: 'sub-1', payment_status: null, debit_date: '2026-10-01T12:00:00.000Z' },
  ], now);

  if (overdue) throw new Error('Ambiguous invoice data must not block a clinic');
});

Deno.test('overdue reminder targets only the unpaid invoice that was not later recovered', () => {
  const overdueIds = getOverdueRecurringInvoiceIds([
    { id: 'old-recovered', mp_preapproval_id: 'sub-1', payment_status: 'rejected', debit_date: '2026-10-01T12:00:00.000Z' },
    { id: 'recovery', mp_preapproval_id: 'sub-1', payment_status: 'approved', debit_date: '2026-10-02T12:00:00.000Z' },
    { id: 'overdue', mp_preapproval_id: 'sub-1', payment_status: 'rejected', debit_date: '2026-10-10T12:00:00.000Z' },
    { id: 'not-overdue', mp_preapproval_id: 'sub-1', payment_status: 'pending', debit_date: '2026-10-13T00:00:00.000Z' },
  ], now);

  if (JSON.stringify(overdueIds) !== JSON.stringify(['overdue'])) {
    throw new Error(`Expected only the unpaid overdue invoice, got ${JSON.stringify(overdueIds)}`);
  }
});

Deno.test('prepaid reminders align with the seven-day grace period', () => {
  const milestones = [0, 1, 2, 3, 4, 5, 6, 7].map(prepaidReminderMilestone);
  const expected = ['prepaid_expired_day_0', null, null, 'prepaid_expired_day_3', null, null, 'prepaid_expired_day_6', null];

  if (JSON.stringify(milestones) !== JSON.stringify(expected)) {
    throw new Error(`Expected reminders on days 0, 3, and 6, got ${JSON.stringify(milestones)}`);
  }
});
