import { describe, it, expect } from 'vitest';
import { Transactions } from './Transactions';
import { pageText, renderPage, screen, waitFor } from '@/test/render';
import {
  defaultCategories,
  makeRule,
  makeTransaction,
  monthsAgo,
  seedUser,
  storedTransactions,
} from '@/test/factories';

function manyTransactions(count: number) {
  return Array.from({ length: count }, (_, index) =>
    makeTransaction({
      id: `t${index}`,
      Description: `MERCHANT ${String(index).padStart(3, '0')}`,
      Amount: -(index + 1),
      Date: monthsAgo(0, (index % 28) + 1),
      Category: 'Groceries',
    })
  );
}

describe('Transactions', () => {
  it('renders an empty state', async () => {
    seedUser({ transactions: [] });
    await renderPage(<Transactions />);
    expect(screen.getByText('No results.')).toBeDefined();
  });

  describe('pagination', () => {
    it('offers controls to move between pages', async () => {
      // Regression: page size was 30 with a "Page 1 of N" label but no
      // next/previous buttons, so rows past the first 30 were unreachable.
      seedUser({ transactions: manyTransactions(45) });
      await renderPage(<Transactions />);

      expect(screen.getByText(/Page 1 of 2/)).toBeDefined();
      expect(screen.getByRole('button', { name: 'Next page' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Previous page' })).toBeDefined();
    });

    it('reaches the rows on the second page', async () => {
      seedUser({ transactions: manyTransactions(45) });
      const { user } = await renderPage(<Transactions />);

      expect(screen.queryByText('MERCHANT 040')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Next page' }));

      await waitFor(() => expect(screen.getByText('MERCHANT 040')).toBeDefined());
      expect(screen.getByText(/Page 2 of 2/)).toBeDefined();
    });

    it('disables paging at the ends', async () => {
      seedUser({ transactions: manyTransactions(45) });
      const { user } = await renderPage(<Transactions />);

      expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true);
      await user.click(screen.getByRole('button', { name: 'Next page' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true)
      );
    });

    it('needs no paging for a single page of results', async () => {
      seedUser({ transactions: manyTransactions(5) });
      await renderPage(<Transactions />);
      expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true);
    });
  });

  describe('dates', () => {
    it('shows an unparseable date verbatim rather than "Invalid Date"', async () => {
      seedUser({
        transactions: [makeTransaction({ Date: 'not-a-date', Description: 'MYSTERY' })],
      });
      await renderPage(<Transactions />);
      expect(pageText()).not.toContain('Invalid Date');
      expect(screen.getByText('not-a-date')).toBeDefined();
    });

    it('formats a good date for display', async () => {
      seedUser({ transactions: [makeTransaction({ Date: '03/05/26' })] });
      await renderPage(<Transactions />);
      expect(screen.getByText('Mar 5, 2026')).toBeDefined();
    });
  });

  describe('currency', () => {
    it('uses the saved preference for amounts', async () => {
      // Regression: the preference was stored but formatCurrency hardcoded USD.
      seedUser({
        settings: { currency: 'EUR' },
        transactions: [makeTransaction({ Amount: -42.5 })],
      });
      await renderPage(<Transactions />);
      expect(screen.getByText('-€42.50')).toBeDefined();
    });

    it('defaults to USD with no preference saved', async () => {
      seedUser({ transactions: [makeTransaction({ Amount: -42.5 })] });
      await renderPage(<Transactions />);
      expect(screen.getByText('-$42.50')).toBeDefined();
    });
  });

  describe('category deep link', () => {
    it('applies ?category= from the URL', async () => {
      seedUser({
        categories: defaultCategories(),
        transactions: [
          makeTransaction({ Description: 'KROGER', Category: 'Groceries' }),
          makeTransaction({ Description: 'SHELL', Category: 'Gas' }),
        ],
      });
      await renderPage(<Transactions />, { route: '/transactions?category=Groceries' });

      expect(screen.getByText('KROGER')).toBeDefined();
      expect(screen.queryByText('SHELL')).toBeNull();
    });
  });

  describe('month options', () => {
    it('lists months newest first and skips unparseable dates', async () => {
      seedUser({
        transactions: [
          makeTransaction({ Date: monthsAgo(2) }),
          makeTransaction({ Date: monthsAgo(0) }),
          makeTransaction({ Date: 'garbage' }),
        ],
      });
      await renderPage(<Transactions />);
      expect(pageText()).not.toContain('undefined');
    });
  });

  describe('rules', () => {
    it('shows saved rules in the rules panel', async () => {
      seedUser({
        categories: defaultCategories(),
        rules: [makeRule({ id: 'r1', matchText: 'KROGER', category: 'Groceries' })],
        transactions: [makeTransaction()],
      });
      const { user } = await renderPage(<Transactions />);

      await user.click(screen.getAllByRole('button', { name: /Rules/ })[0]);
      await waitFor(() => expect(screen.getByText('KROGER')).toBeDefined());
    });
  });

  it('leaves stored transactions untouched on a plain render', async () => {
    const transactions = [makeTransaction({ id: 'a' })];
    seedUser({ transactions });
    await renderPage(<Transactions />);
    expect(storedTransactions().map((t) => t.id)).toEqual(['a']);
  });
});
