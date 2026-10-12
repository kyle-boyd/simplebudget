import { describe, it, expect } from 'vitest';
import {
  ALL_MONTHS,
  filterByMonth,
  formatTransactionDate,
  monthLabelFor,
  monthOptions,
  parseMonthLabel,
  parseTransactionDate,
  previousMonthLabel,
} from './months';

const txns = [
  { Date: '03/15/26', id: '1' },
  { Date: '10/02/25', id: '2' },
  { Date: '01/09/26', id: '3' },
  { Date: '03/01/26', id: '4' },
  { Date: 'garbage', id: '5' },
];

describe('parseTransactionDate', () => {
  it('reads the stored MM/DD/YY format', () => {
    expect(parseTransactionDate('03/05/26')).toEqual(new Date(2026, 2, 5));
  });

  it('accepts a four-digit year', () => {
    expect(parseTransactionDate('03/05/2026')).toEqual(new Date(2026, 2, 5));
  });

  it.each([
    ['garbage', 'non-numeric'],
    ['13/01/26', 'month out of range'],
    ['01/32/26', 'day out of range'],
    ['03/26', 'too few parts'],
    ['', 'empty'],
  ])('returns null for %s (%s)', (input) => {
    expect(parseTransactionDate(input)).toBeNull();
  });

  it('returns null rather than an Invalid Date object', () => {
    // Regression: callers fed the result straight to toLocaleDateString, which
    // rendered the literal string "Invalid Date" in the table.
    expect(parseTransactionDate(undefined)).toBeNull();
  });
});

describe('formatTransactionDate', () => {
  it('formats as the app displays dates', () => {
    expect(formatTransactionDate('03/05/26')).toBe('Mar 5, 2026');
  });

  it('echoes an unparseable value instead of "Invalid Date"', () => {
    expect(formatTransactionDate('garbage')).toBe('garbage');
  });

  it('renders nothing for a missing date', () => {
    expect(formatTransactionDate(undefined)).toBe('');
  });
});

describe('monthOptions', () => {
  it('lists months newest first, behind All Months', () => {
    // Regression: the list came out in whatever order transactions happened to
    // be in, because it was built from a Set over an unsorted map.
    expect(monthOptions(txns)).toEqual([
      ALL_MONTHS,
      'March, 2026',
      'January, 2026',
      'October, 2025',
    ]);
  });

  it('skips transactions whose date will not parse', () => {
    // Regression: these produced an "undefined, 20undefined" entry.
    expect(monthOptions(txns).join()).not.toMatch(/undefined/);
  });

  it('de-duplicates months', () => {
    expect(monthOptions(txns).filter((m) => m === 'March, 2026')).toHaveLength(1);
  });

  it('returns just All Months when there is nothing to show', () => {
    expect(monthOptions([])).toEqual([ALL_MONTHS]);
  });
});

describe('filterByMonth', () => {
  it('keeps only the selected month', () => {
    expect(filterByMonth(txns, 'March, 2026').map((t) => t.id)).toEqual(['1', '4']);
  });

  it('passes everything through for All Months', () => {
    expect(filterByMonth(txns, ALL_MONTHS)).toHaveLength(5);
  });

  it('passes everything through for an unrecognised label', () => {
    expect(filterByMonth(txns, 'Nonsense, 2026')).toHaveLength(5);
  });

  it('excludes unparseable dates from a specific month', () => {
    expect(filterByMonth(txns, 'March, 2026').map((t) => t.id)).not.toContain('5');
  });
});

describe('month labels', () => {
  it('round-trips a label', () => {
    expect(parseMonthLabel(monthLabelFor('03/15/26')!)).toEqual({ year: 2026, month: 2 });
  });

  it('steps back a month', () => {
    expect(previousMonthLabel('March, 2026')).toBe('February, 2026');
  });

  it('wraps across the year boundary', () => {
    expect(previousMonthLabel('January, 2026')).toBe('December, 2025');
  });

  it('has no previous month for All Months', () => {
    expect(previousMonthLabel(ALL_MONTHS)).toBeNull();
  });
});
