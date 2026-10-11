import { describe, it, expect } from 'vitest';
import { createTransactionId, formatCurrency, parseDate } from './utils';

describe('formatCurrency', () => {
  it('defaults to USD', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it('honours the requested currency', () => {
    expect(formatCurrency(10, 'EUR')).toBe('€10.00');
    expect(formatCurrency(10, 'GBP')).toBe('£10.00');
  });

  it('shows zero rather than letting NaN reach the UI', () => {
    expect(formatCurrency(NaN)).toBe('$0.00');
    expect(formatCurrency(Infinity)).toBe('$0.00');
  });

  it('falls back to USD for an unknown currency code', () => {
    // Intl throws on a bad code; a stored junk preference must not blank the page.
    expect(formatCurrency(10, 'NOPE')).toBe('$10.00');
  });
});

describe('parseDate', () => {
  it.each([
    ['03/05/26', '03/05/26'],
    ['3/5/26', '03/05/26'],
    ['03/05/2026', '03/05/26'],
    ['2026-03-05', '03/05/26'],
    ['03-05-2026', '03/05/26'],
  ])('normalises %s to %s', (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it('reads an ISO date as a local date, not UTC', () => {
    // A UTC parse shifts the day backwards west of Greenwich.
    expect(parseDate('2026-04-02')).toBe('04/02/26');
  });

  it('returns the input untouched when it cannot parse', () => {
    expect(parseDate('not-a-date')).toBe('not-a-date');
  });

  it('returns empty for nothing', () => {
    expect(parseDate('')).toBe('');
  });
});

describe('createTransactionId', () => {
  const base = { Date: '01/01/26', Description: 'COFFEE', Amount: -5 };

  it('is stable for the same content, so re-importing a CSV does not duplicate', () => {
    expect(createTransactionId(base)).toBe(createTransactionId({ ...base }));
  });

  it('keeps the original id shape at occurrence 0', () => {
    // Existing stored transactions were hashed without an occurrence; changing
    // this would make every prior import look new.
    expect(createTransactionId(base, 0)).toBe(createTransactionId(base));
  });

  it('distinguishes genuinely repeated transactions', () => {
    // Regression: two identical $5 coffees on one day hashed alike, so the
    // second was silently dropped as a duplicate.
    expect(createTransactionId(base, 1)).not.toBe(createTransactionId(base, 0));
    expect(createTransactionId(base, 2)).not.toBe(createTransactionId(base, 1));
  });

  it('separates transactions that differ in any field', () => {
    const ids = new Set([
      createTransactionId(base),
      createTransactionId({ ...base, Amount: -6 }),
      createTransactionId({ ...base, Description: 'TEA' }),
      createTransactionId({ ...base, Date: '01/02/26' }),
    ]);
    expect(ids.size).toBe(4);
  });
});
