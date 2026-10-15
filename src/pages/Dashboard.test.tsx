import { beforeEach, describe, it, expect } from 'vitest';
import type { Category } from '@/hooks/useCategories';
import { Dashboard } from './Dashboard';
import { pageText, renderPage, screen } from '@/test/render';
import { makeTransaction, monthsAgo, seedUser } from '@/test/factories';

/**
 * The clock is frozen at 11 Oct 2026 — day 11 of a 31-day month. Food (budget
 * 310) and Transportation (budget 62) are flexible; Rent is a fixed bill. The
 * round budgets make the day-11 pace maths land on whole numbers:
 *   Food spent 132 → projected 372 (over by 62)
 *   hero spent 154 → projected 434 (over by 62)
 */
function budgetCategories(): Category[] {
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

function seedOverPace() {
  seedUser({
    categories: budgetCategories(),
    transactions: [
      makeTransaction({ Date: monthsAgo(0, 5), Amount: -100, Category: 'Groceries' }),
      makeTransaction({ Date: monthsAgo(0, 8), Amount: -32, Category: 'Restaurants' }),
      makeTransaction({ Date: monthsAgo(0, 3), Amount: -22, Category: 'Gas' }),
      makeTransaction({ Date: monthsAgo(0, 1), Amount: -1500, Category: 'Rent' }),
      makeTransaction({ Date: monthsAgo(0, 2), Amount: -50, Category: '' }),
      // A big uncategorized paycheck: must not inflate "not counted" or the count.
      makeTransaction({ Date: monthsAgo(0, 4), Amount: 2000, Category: '', flow: 'in' }),
    ],
  });
}

describe('Dashboard', () => {
  beforeEach(() => localStorage.clear());

  it('renders the current month with no data and no NaN', async () => {
    seedUser({ transactions: [] });
    await renderPage(<Dashboard />);
    expect(screen.getByRole('heading', { level: 1, name: 'October' })).toBeDefined();
    expect(pageText()).toContain('Day 11 of 31');
    expect(pageText()).not.toMatch(/NaN|Invalid Date|undefined/);
  });

  it('shows the flexible hero over-pace headline, naming the driver', async () => {
    seedOverPace();
    await renderPage(<Dashboard />);
    expect(screen.getByRole('heading', { level: 2, name: /Headed \$62 over/ })).toBeDefined();
    expect(pageText()).toContain('Over pace');
    expect(pageText()).toContain('Food'); // the driver
  });

  it('counts only uncategorized spending in the to-do row, excluding income', async () => {
    seedOverPace();
    await renderPage(<Dashboard />);
    expect(pageText()).toContain('1 transaction needs a category');
    expect(pageText()).toContain('$50 not counted');
    expect(pageText()).not.toContain('$2,050');
    expect(screen.getByRole('link', { name: 'Categorize' })).toBeDefined();
  });

  it('summarises fixed bills separately from the flexible hero', async () => {
    seedOverPace();
    await renderPage(<Dashboard />);
    expect(pageText()).toMatch(/Fixed bills\s*\$1,500\s*of\s*\$1,500\s*paid/);
  });

  it('shows per-category cards riskiest first with the $/day badge only when over pace', async () => {
    seedOverPace();
    await renderPage(<Dashboard />);
    const text = pageText();
    // Food (over) ahead of Transportation (on pace) in the DOM order.
    expect(text.indexOf('Food')).toBeLessThan(text.indexOf('Transportation'));
    expect(text).toContain('/day left'); // Food is over pace
    expect(text).toContain('On pace'); // Transportation
    // Fixed and hidden categories never appear as flexible cards.
    expect(text).not.toContain('Rent');
    expect(text).not.toContain('Reimbursements');
  });

  it('shows "All caught up" when nothing needs a category', async () => {
    seedUser({
      categories: budgetCategories(),
      transactions: [makeTransaction({ Date: monthsAgo(0, 5), Amount: -100, Category: 'Groceries' })],
    });
    await renderPage(<Dashboard />);
    expect(pageText()).toContain('All caught up');
    expect(pageText()).not.toMatch(/needs? a category/);
  });

  describe('month stepper', () => {
    it('disables "This month" while on the current month', async () => {
      seedOverPace();
      await renderPage(<Dashboard />);
      const button = screen.getByRole('button', { name: 'This month' }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it('steps to a past month and shows the final result without a day counter', async () => {
      seedUser({
        categories: budgetCategories(),
        transactions: [makeTransaction({ Date: monthsAgo(1, 10), Amount: -400, Category: 'Groceries' })],
      });
      const { user } = await renderPage(<Dashboard />);
      await user.click(screen.getByRole('button', { name: 'Previous month' }));
      expect(screen.getByRole('heading', { level: 1, name: 'September' })).toBeDefined();
      expect(pageText()).not.toMatch(/Day \d+ of/);
      expect(pageText()).toContain('over budget'); // 400 spent of 310 → final-over
    });
  });
});
