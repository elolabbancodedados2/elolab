export type PlatformPlanInvoice = {
  id?: string | null;
  mp_preapproval_id: string | null;
  payment_status: string | null;
  debit_date?: string | null;
  date_created?: string | null;
};

const GRACE_MS = 72 * 60 * 60 * 1000;
const UNPAID_PAYMENT_STATUSES = new Set([
  'authorized',
  'cancelled',
  'charged_back',
  'in_mediation',
  'in_process',
  'pending',
  'rejected',
  'refunded',
]);

function invoiceDate(invoice: PlatformPlanInvoice): number | null {
  const value = invoice.debit_date || invoice.date_created;
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** True only when an explicit unpaid recurring invoice is at least 72 hours past due. */
function overdueInvoices(
  invoices: PlatformPlanInvoice[],
  now: Date = new Date(),
): PlatformPlanInvoice[] {
  const cutoff = now.getTime() - GRACE_MS;
  const normalized = invoices.map((invoice) => ({
    invoice,
    date: invoiceDate(invoice),
    status: invoice.payment_status?.trim().toLowerCase() || null,
  }));

  return normalized.filter(({ invoice, date, status }) => {
    if (!invoice.mp_preapproval_id || date === null || date > cutoff || !status) return false;
    if (!UNPAID_PAYMENT_STATUSES.has(status)) return false;

    const recovered = normalized.some((candidate) =>
      candidate.invoice.mp_preapproval_id === invoice.mp_preapproval_id &&
      candidate.status === 'approved' &&
      candidate.date !== null &&
      candidate.date >= date
    );
    return !recovered;
  }).map(({ invoice }) => invoice);
}

export function hasOverdueRecurringInvoice(
  invoices: PlatformPlanInvoice[],
  now: Date = new Date(),
): boolean {
  return overdueInvoices(invoices, now).length > 0;
}

export function getOverdueRecurringInvoiceIds(
  invoices: PlatformPlanInvoice[],
  now: Date = new Date(),
): string[] {
  return overdueInvoices(invoices, now)
    .map((invoice) => invoice.id?.trim() || '')
    .filter(Boolean);
}

export function prepaidReminderMilestone(daysSinceExpiry: number): string | null {
  if (daysSinceExpiry === 0) return 'prepaid_expired_day_0';
  if (daysSinceExpiry === 3) return 'prepaid_expired_day_3';
  if (daysSinceExpiry === 6) return 'prepaid_expired_day_6';
  return null;
}
