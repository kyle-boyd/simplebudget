/**
 * Transaction dates are stored as `MM/DD/YY` strings (see `parseDate`). Every
 * page needs to turn those into month labels, filter by them and sort them, so
 * the parsing lives here rather than being re-derived in each page.
 */

export const ALL_MONTHS = 'All Months';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTH_NAMES = MONTH_NAMES.map(name => name.slice(0, 3));

export interface HasDate {
  Date: string;
}

/** Returns null for anything that doesn't parse, so callers can skip the row instead of rendering NaN. */
export function parseTransactionDate(date: string | undefined | null): Date | null {
  if (!date) return null;

  const parts = String(date).split('/');
  if (parts.length !== 3) return null;

  const month = Number(parts[0]);
  const day = Number(parts[1]);
  const year = Number(parts[2]);
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const fullYear = parts[2].trim().length > 2 ? year : 2000 + year;
  const parsed = new Date(fullYear, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The app-wide display format, e.g. `Oct 11, 2026`. */
export function formatTransactionDate(date: string | undefined | null): string {
  const parsed = parseTransactionDate(date);
  if (!parsed) return date ? String(date) : '';
  return `${SHORT_MONTH_NAMES[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`;
}

/** The month-picker label for a transaction date, e.g. `October, 2026`. */
export function monthLabelFor(date: string | undefined | null): string | null {
  const parsed = parseTransactionDate(date);
  if (!parsed) return null;
  return `${MONTH_NAMES[parsed.getMonth()]}, ${parsed.getFullYear()}`;
}

/** Turns a month-picker label back into a year and 0-indexed month. */
export function parseMonthLabel(label: string): { year: number; month: number } | null {
  const [monthName, year] = (label || '').split(', ');
  const month = MONTH_NAMES.indexOf(monthName);
  const parsedYear = Number(year);
  if (month < 0 || !Number.isInteger(parsedYear)) return null;
  return { year: parsedYear, month };
}

/** `ALL_MONTHS` followed by every month present in `transactions`, newest first. */
export function monthOptions(transactions: HasDate[]): string[] {
  const order = new Map<string, number>();

  for (const transaction of transactions) {
    const parsed = parseTransactionDate(transaction.Date);
    if (!parsed) continue;
    const label = `${MONTH_NAMES[parsed.getMonth()]}, ${parsed.getFullYear()}`;
    if (!order.has(label)) {
      order.set(label, parsed.getFullYear() * 12 + parsed.getMonth());
    }
  }

  const labels = [...order.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([label]) => label);

  return [ALL_MONTHS, ...labels];
}

export function filterByMonth<T extends HasDate>(transactions: T[], label: string): T[] {
  if (label === ALL_MONTHS) return transactions;

  const target = parseMonthLabel(label);
  if (!target) return transactions;

  return transactions.filter(transaction => {
    const parsed = parseTransactionDate(transaction.Date);
    return !!parsed && parsed.getFullYear() === target.year && parsed.getMonth() === target.month;
  });
}

/** The month before `label`, or null when `label` isn't a specific month. */
export function previousMonthLabel(label: string): string | null {
  const target = parseMonthLabel(label);
  if (!target) return null;
  const month = target.month === 0 ? 11 : target.month - 1;
  const year = target.month === 0 ? target.year - 1 : target.year;
  return `${MONTH_NAMES[month]}, ${year}`;
}
