import { dateOnlyInTimeZone } from '@/lib/dateOnly';

export const FINANCE_OVERVIEW_TABS = ['resumo', 'dre', 'categorias'] as const;
export type FinanceOverviewTab = typeof FINANCE_OVERVIEW_TABS[number];
export const ACCOUNT_FILTER_STATUSES = ['aberto', 'pendente', 'parcial', 'atrasado', 'pago', 'cancelado'] as const;
export type AccountFilterStatus = typeof ACCOUNT_FILTER_STATUSES[number] | 'todos';

const ACCOUNT_PERIODS = ['mes_atual', 'mes_anterior', 'ultimos_3', 'ultimos_6', 'todos'] as const;

const MONTH_PARAM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Parse a YYYY-MM route value without allowing Date to silently normalize invalid months. */
export function parseFinanceMonth(value: string | null | undefined): Date | null {
  if (!value || !MONTH_PARAM.test(value)) return null;

  const [year, month] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, 1);
  date.setHours(12, 0, 0, 0);

  return date.getFullYear() === year && date.getMonth() === month - 1 ? date : null;
}

export function formatFinanceMonth(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function currentFinanceMonth(now = new Date()): Date {
  const month = dateOnlyInTimeZone(now, 'America/Sao_Paulo').slice(0, 7);
  return parseFinanceMonth(month)!;
}

export function parseFinanceOverviewTab(value: string | null | undefined): FinanceOverviewTab {
  return FINANCE_OVERVIEW_TABS.includes(value as FinanceOverviewTab)
    ? value as FinanceOverviewTab
    : 'resumo';
}

export function parseAccountFilterStatus(value: string | null | undefined): AccountFilterStatus {
  return ACCOUNT_FILTER_STATUSES.includes(value as typeof ACCOUNT_FILTER_STATUSES[number])
    ? value as typeof ACCOUNT_FILTER_STATUSES[number]
    : 'todos';
}

export function normalizeAccountRouteParams(searchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  const status = next.get('status');
  if (status !== null && (status === 'todos' || !ACCOUNT_FILTER_STATUSES.includes(status as typeof ACCOUNT_FILTER_STATUSES[number]))) {
    next.delete('status');
  }

  const month = next.get('mes');
  if (month !== null && !parseFinanceMonth(month)) next.delete('mes');

  const period = next.get('periodo');
  if (period !== null && !ACCOUNT_PERIODS.includes(period as typeof ACCOUNT_PERIODS[number])) next.delete('periodo');
  if (next.has('mes')) next.delete('periodo');

  return next;
}

export function normalizeFinanceRouteParams(
  searchParams: URLSearchParams,
  now = new Date(),
  includeOverviewTab = false,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  const month = next.get('mes');
  if (month !== null && !parseFinanceMonth(month)) {
    next.set('mes', formatFinanceMonth(currentFinanceMonth(now)));
  }

  const tab = next.get('tab');
  if (includeOverviewTab && tab !== null && !FINANCE_OVERVIEW_TABS.includes(tab as FinanceOverviewTab)) {
    next.set('tab', 'resumo');
  }

  return next;
}
