import { describe, it, expect } from 'vitest';
import { Budget } from './Budget';
import { pageText, renderPage, screen, waitFor } from '@/test/render';
import {
  defaultCategories,
  makeRule,
  makeTransaction,
  monthsAgo,
  seedUser,
  storedCategories,
  storedMappings,
  storedRules,
  storedTransactions,
} from '@/test/factories';

/**
 * Budget renders a mobile and a desktop variant of every row; Tailwind hides
 * one, but jsdom applies no CSS so both are in the tree. The mobile row is the
 * one wrapped in a button, and tapping it opens the edit sheet.
 */
function openEditSheetFor(name: string): HTMLButtonElement {
  const row = screen
    .getAllByText(name)
    .map((node) => node.closest('button'))
    .find((button): button is HTMLButtonElement => button !== null);
  if (!row) throw new Error(`No tappable row for "${name}"`);
  return row;
}

describe('Budget', () => {
  it('lists categories and their subcategories', async () => {
    seedUser({ categories: defaultCategories(), transactions: [] });
    await renderPage(<Budget />);

    expect(screen.getAllByText('Food').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Groceries').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gas').length).toBeGreaterThan(0);
  });

  it('renders with no transactions without producing NaN', async () => {
    seedUser({ categories: defaultCategories(), transactions: [] });
    await renderPage(<Budget />);
    expect(pageText()).not.toMatch(/NaN/);
  });

  describe('spend figures', () => {
    it('totals the selected month', async () => {
      seedUser({
        categories: defaultCategories(),
        transactions: [
          makeTransaction({ Date: monthsAgo(0, 2), Amount: -30, Category: 'Groceries' }),
          makeTransaction({ Date: monthsAgo(0, 3), Amount: -20, Category: 'Groceries' }),
        ],
      });
      localStorage.setItem('selectedMonth', 'All Months');
      await renderPage(<Budget />);
      // One month of data, so the All Months average equals that month's total.
      expect(screen.getAllByText('$50.00').length).toBeGreaterThan(0);
    });

    it('is not poisoned by a transaction under the system category', async () => {
      seedUser({
        categories: defaultCategories(),
        transactions: [
          makeTransaction({ Amount: -30, Category: 'Groceries' }),
          makeTransaction({ Amount: 500, Category: 'Reimbursements' }),
        ],
      });
      await renderPage(<Budget />);
      expect(pageText()).not.toMatch(/NaN/);
    });

    it('applies the saved currency', async () => {
      seedUser({
        settings: { currency: 'EUR' },
        categories: defaultCategories(),
        transactions: [makeTransaction({ Amount: -30, Category: 'Groceries' })],
      });
      await renderPage(<Budget />);
      expect(pageText()).toContain('€');
    });
  });

  describe('renaming a subcategory', () => {
    it('re-files the transactions filed under the old name', async () => {
      // Regression: transactions reference the category by name, so a rename
      // orphaned them - they rendered as an invalid category and dropped out of
      // the budget totals entirely.
      seedUser({
        categories: defaultCategories(),
        transactions: [
          makeTransaction({ id: 'keep', Amount: -40, Category: 'Gas' }),
          makeTransaction({ id: 'other', Amount: -10, Category: 'Groceries' }),
        ],
        rules: [makeRule({ id: 'r1', matchText: 'SHELL', category: 'Gas' })],
        mappings: { transport: 'Gas', food: 'Groceries' },
      });
      const { user } = await renderPage(<Budget />);

      await user.click(openEditSheetFor('Gas'));

      const input = await waitFor(() => screen.getByLabelText('Name'));
      await user.clear(input);
      await user.type(input, 'Fuel');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(storedTransactions().find((t) => t.id === 'keep')?.Category).toBe('Fuel');
      });

      // and the rest of the references follow
      expect(storedTransactions().find((t) => t.id === 'other')?.Category).toBe('Groceries');
      expect(Object.values(storedRules())[0].category).toBe('Fuel');
      expect(storedMappings()).not.toHaveProperty('transport');
      expect(storedMappings()).toHaveProperty('food', 'Groceries');

      const renamed = storedCategories()
        .flatMap((c) => c.subcategories ?? [])
        .map((s) => s.name);
      expect(renamed).toContain('Fuel');
      expect(renamed).not.toContain('Gas');
    });
  });

  describe('deleting a subcategory', () => {
    it('warns how many transactions it would un-file', async () => {
      seedUser({
        categories: defaultCategories(),
        transactions: [
          makeTransaction({ Amount: -40, Category: 'Gas' }),
          makeTransaction({ Amount: -20, Category: 'Gas' }),
        ],
      });
      const { user } = await renderPage(<Budget />);

      await user.click(screen.getAllByTitle('Delete subcategory')[2]);
      await waitFor(() => expect(screen.getByText(/2 transactions affected/)).toBeDefined());
    });

    it('un-files the affected transactions and drops matching rules', async () => {
      seedUser({
        categories: defaultCategories(),
        transactions: [makeTransaction({ id: 'orphan', Amount: -40, Category: 'Gas', confirmed: true })],
        rules: [makeRule({ id: 'r1', category: 'Gas' })],
        mappings: { transport: 'Gas' },
      });
      const { user } = await renderPage(<Budget />);

      await user.click(screen.getAllByTitle('Delete subcategory')[2]);
      await user.click(await waitFor(() => screen.getByRole('button', { name: 'Delete' })));

      await waitFor(() => {
        const orphan = storedTransactions().find((t) => t.id === 'orphan');
        expect(orphan?.Category).toBeFalsy();
      });
      // Un-confirmed too, so it resurfaces for re-filing rather than hiding.
      expect(storedTransactions().find((t) => t.id === 'orphan')?.confirmed).toBeFalsy();
      expect(storedRules()).toEqual({});
      expect(storedMappings()).toEqual({});
    });
  });

  describe('month picker', () => {
    it('produces no malformed option for an unparseable date', async () => {
      seedUser({
        categories: defaultCategories(),
        transactions: [makeTransaction({ Date: 'garbage', Category: 'Groceries' })],
      });
      await renderPage(<Budget />);
      expect(pageText()).not.toContain('undefined');
    });
  });
});
