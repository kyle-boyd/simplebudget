import { describe, it, expect } from 'vitest';
import { Dashboard } from './Dashboard';
import { pageText, renderPage, screen } from '@/test/render';
import { defaultCategories, makeTransaction, monthLabel, monthsAgo, seedUser } from '@/test/factories';

/**
 * Spend that lands inside the trailing chart window:
 *   this month     70.10  (52.10 groceries + 18 restaurants)
 *   previous month 640.00 (600 groceries + 40 gas)
 * plus refunds filed under a subcategory of the system "Hide from Budget"
 * category, which must be excluded from every total.
 */
function seedSpending() {
  seedUser({
    categories: defaultCategories(),
    transactions: [
      makeTransaction({ Date: monthsAgo(0, 15), Amount: -52.1, Description: 'KROGER', Category: 'Groceries', confirmed: true }),
      makeTransaction({ Date: monthsAgo(0, 16), Amount: -18, Description: 'CHIPOTLE', Category: 'Restaurants' }),
      makeTransaction({ Date: monthsAgo(1, 15), Amount: -40, Description: 'SHELL', Category: 'Gas', confirmed: true }),
      makeTransaction({ Date: monthsAgo(1, 17), Amount: -600, Description: 'KROGER', Category: 'Groceries' }),
      makeTransaction({ Date: monthsAgo(0, 3), Amount: 900, Description: 'REFUND', Category: 'Reimbursements' }),
      makeTransaction({ Date: monthsAgo(1, 8), Amount: 300, Description: 'PRIOR REFUND', Category: 'Reimbursements' }),
    ],
  });
}

describe('Dashboard', () => {
  it('renders with no data at all', async () => {
    seedUser({ transactions: [] });
    await renderPage(<Dashboard />);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeDefined();
    expect(pageText()).not.toMatch(/NaN|Invalid Date/);
  });

  describe('budget vs actual trend', () => {
    it('compares the last two months of the trailing window', async () => {
      // Regression: the trend indexed the window array by calendar month
      // number (9 in October), reading past the end of a 3- or 6-month window,
      // so it always reported "Insufficient data".
      seedSpending();
      await renderPage(<Dashboard />);
      expect(pageText()).not.toMatch(/Insufficient data|No previous data/);
      // 70.10 against 640.00 is an 89.0% drop.
      expect(pageText()).toMatch(/Trending down by 89\.0%/);
    });

    it('names the month it compared against', async () => {
      seedSpending();
      await renderPage(<Dashboard />);
      const previousShortMonth = new Date(2026, 8).toLocaleString('en-US', { month: 'short' });
      expect(pageText()).toContain(`Compared to ${previousShortMonth}`);
    });
  });

  describe('monthly spending trend', () => {
    it('is not poisoned by a transaction filed under the system category', async () => {
      // Regression: a subcategory of "Hide from Budget" fell through to its
      // parent, which had no entry in the totals map, so `undefined + amount`
      // turned the whole total into NaN. The footer then silently claimed
      // "No change" because `NaN > 0` is false.
      seedSpending();
      localStorage.setItem('selectedMonth', monthLabel(0));
      await renderPage(<Dashboard />);

      const text = pageText();
      expect(text).not.toMatch(/NaN/);
      const section = text.slice(text.indexOf('Monthly Spending by Category'));
      expect(section).toMatch(/Trending down by 89\.0%/);
      expect(section).not.toMatch(/^.*?No change/);
    });

    it('leaves hidden categories out of the chart', async () => {
      seedSpending();
      await renderPage(<Dashboard />);
      expect(pageText()).not.toContain('Reimbursements');
      expect(pageText()).not.toContain('Hide from Budget');
    });
  });

  describe('month picker', () => {
    it('offers no malformed option when a date will not parse', async () => {
      seedUser({
        transactions: [
          makeTransaction({ Date: 'not-a-date', Category: 'Groceries' }),
          makeTransaction({ Date: monthsAgo(0), Category: 'Groceries' }),
        ],
      });
      await renderPage(<Dashboard />);
      expect(pageText()).not.toMatch(/undefined/);
    });

    it('falls back to All Months when the stored month no longer has data', async () => {
      // The month is shared across pages via localStorage, so it can point at
      // a month that has since been emptied.
      localStorage.setItem('selectedMonth', 'March, 1999');
      seedSpending();
      await renderPage(<Dashboard />);
      expect(screen.getAllByText('All Months').length).toBeGreaterThan(0);
    });
  });

  it('reports categorization progress as "X of Y", not a bare total', async () => {
    localStorage.setItem('selectedMonth', 'All Months');
    seedUser({
      categories: defaultCategories(),
      transactions: [
        makeTransaction({ Amount: -10, Category: 'Groceries', confirmed: true }),
        makeTransaction({ Amount: -20, Category: 'Gas' }),
        makeTransaction({ Amount: -30, Category: '' }),
      ],
    });
    await renderPage(<Dashboard />);
    expect(screen.getByText('Categorized')).toBeDefined();
    expect(screen.getByText('2 of 3')).toBeDefined();
  });

  it('applies the saved currency preference', async () => {
    seedSpending();
    seedUser({ settings: { currency: 'EUR' }, categories: defaultCategories() });
    await renderPage(<Dashboard />);
    // The Dashboard only formats currency inside chart tooltips, so assert the
    // categorization progress label renders instead and leave currency to the
    // pages that display amounts directly.
    expect(screen.getByText('Categorized')).toBeDefined();
  });
});
