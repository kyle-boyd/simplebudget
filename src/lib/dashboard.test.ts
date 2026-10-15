import { describe, it, expect } from 'vitest';
import type { Category } from '@/hooks/useCategories';
import type { Transaction } from '@/hooks/useTransactions';
import { TEST_NOW } from '@/test/setup';
import { makeTransaction, monthsAgo } from '@/test/factories';
import {
  currentMonthSelection,
  monthContext,
  paceMetrics,
  shiftMonth,
  summarizeMonth,
} from './dashboard';

/**
 * Categories: Food (flexible, budget 310) and Transportation (flexible, budget
 * 62) are paced; Rent is a fixed bill; "Hide from Budget" is excluded entirely.
 * 310 and 62 are chosen so the day-11-of-31 pace maths lands on round numbers.
 */
function categories(): Category[] {
  return [
    {
      id: 1,
      name: 'Hide from Budget',
      isSystem: true,
      subcategories: [
        { id: 11, name: 'Hide from Budget', isSystem: true, amount: 0 },
        { id: 12, name: 'Reimbursements', amount: 0 },
      ],
    },
    {
      id: 2,
      name: 'Food',
      kind: 'flexible',
      subcategories: [
        { id: 21, name: 'Groceries', amount: 200 },
        { id: 22, name: 'Restaurants', amount: 110 },
      ],
    },
    { id: 3, name: 'Transportation', kind: 'flexible', subcategories: [{ id: 31, name: 'Gas', amount: 62 }] },
    { id: 4, name: 'Rent', kind: 'fixed', amount: 1500, subcategories: [] },
  ];
}

/** Spend across the current month (Oct 2026), all on days ≤ 11 so it's "through today". */
function currentMonthTransactions(): Transaction[] {
  return [
    makeTransaction({ Date: monthsAgo(0, 5), Amount: -100, Category: 'Groceries' }),
    makeTransaction({ Date: monthsAgo(0, 8), Amount: -32, Category: 'Restaurants' }),
    makeTransaction({ Date: monthsAgo(0, 3), Amount: -22, Category: 'Gas' }),
    makeTransaction({ Date: monthsAgo(0, 1), Amount: -1500, Category: 'Rent' }),
    makeTransaction({ Date: monthsAgo(0, 2), Amount: -50, Category: '' }),
    // Income and a hidden refund must not count as spending anywhere.
    makeTransaction({ Date: monthsAgo(0, 4), Amount: 2000, Category: '', flow: 'in' }),
    makeTransaction({ Date: monthsAgo(0, 6), Amount: 900, Category: 'Reimbursements' }),
  ];
}

describe('paceMetrics', () => {
  it('projects a full month from the elapsed days', () => {
    const m = paceMetrics(132, 310, 11, 31);
    expect(m.expectedByToday).toBeCloseTo(110, 6);
    expect(m.vsPace).toBeCloseTo(22, 6);
    expect(m.projected).toBeCloseTo(372, 6);
    expect(m.perDayLeft).toBeCloseTo((310 - 132) / 20, 6);
  });

  it('once the month is over, projected equals spent and nothing is left per day', () => {
    const m = paceMetrics(400, 310, 31, 31);
    expect(m.projected).toBe(400);
    expect(m.perDayLeft).toBe(0);
    expect(m.expectedByToday).toBe(310);
  });
});

describe('summarizeMonth (current month)', () => {
  const data = summarizeMonth(
    currentMonthTransactions(),
    categories(),
    monthContext(currentMonthSelection(TEST_NOW), TEST_NOW)
  );

  it('sums only flexible spending into the hero, excluding fixed/income/hidden', () => {
    expect(data.hero.spent).toBe(154); // 100 + 32 + 22
    expect(data.hero.budget).toBe(372); // 310 + 62
    expect(data.hero.projected).toBeCloseTo(434, 6); // 154 / 11 × 31
    expect(data.hero.overPace).toBe(true);
    expect(data.hero.drivers).toEqual(['Food']);
  });

  it('summarises fixed bills separately from the pace maths', () => {
    expect(data.fixedBills).toEqual({ paid: 1500, total: 1500 });
  });

  it('counts uncategorized spending only (income does not nag)', () => {
    expect(data.uncategorized).toEqual({ count: 1, amount: 50 });
  });

  it('orders categories riskiest first and notes each one', () => {
    expect(data.categories.map(c => c.name)).toEqual(['Food', 'Transportation']);
    expect(data.categories[0].note).toEqual({ kind: 'over', amount: 372 }); // "Headed for $372" (projected total)
    expect(data.categories[1].note.kind).toBe('on'); // projected 62 vs 62
    expect(data.categories[0].overPace).toBe(true);
    expect(data.categories[1].overPace).toBe(false);
  });

  it('builds a burn-up series that stops the actual line at today and projects past it', () => {
    const last = data.burnUp[data.burnUp.length - 1];
    expect(last.day).toBe(31);
    expect(last.pace).toBeCloseTo(372, 6); // ends at budget
    expect(last.projected).toBeCloseTo(434, 6);
    expect(data.burnUp[11].actual).toBeCloseTo(154, 6);
    expect(data.burnUp[12].actual).toBeNull(); // nothing known after today
  });
});

describe('summarizeMonth (early month)', () => {
  it('refuses to project in the first five days', () => {
    const earlyNow = new Date(2026, 9, 3, 12, 0, 0); // Oct 3
    const ctx = monthContext(currentMonthSelection(earlyNow), earlyNow);
    expect(ctx.projectionReliable).toBe(false);

    const data = summarizeMonth(currentMonthTransactions(), categories(), ctx);
    expect(data.categories.every(c => c.note.kind === 'too-early')).toBe(true);
  });
});

describe('summarizeMonth (past month)', () => {
  it('shows the final result with no projection', () => {
    const ctx = monthContext(shiftMonth(currentMonthSelection(TEST_NOW), -1), TEST_NOW);
    expect(ctx.isPast).toBe(true);

    const data = summarizeMonth(
      [makeTransaction({ Date: monthsAgo(1, 10), Amount: -400, Category: 'Groceries' })],
      categories(),
      ctx
    );

    const food = data.categories.find(c => c.name === 'Food');
    expect(food?.spent).toBe(400);
    expect(food?.note).toEqual({ kind: 'final-over', amount: 90 }); // 400 − 310
    expect(data.burnUp.every(p => p.projected === null)).toBe(true);
  });
});
