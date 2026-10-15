import { describe, it, expect } from 'vitest';
import { Review } from './Review';
import { pageText, renderPage, screen, waitFor } from '@/test/render';
import {
  defaultCategories,
  makeTransaction,
  seedUser,
  storedRules,
  storedTransactions,
} from '@/test/factories';
import { fakeDb } from '@/test/fakes/firebase-database';

const categories = defaultCategories();

describe('Review', () => {
  it('says there is nothing to do once everything is confirmed', async () => {
    seedUser({
      categories,
      transactions: [makeTransaction({ Category: 'Groceries', confirmed: true })],
    });
    await renderPage(<Review />, { route: '/review' });
    expect(pageText()).toContain('Nothing to review');
  });

  describe('transactions filed by a rule', () => {
    it('accepts the whole bucket in a single write', async () => {
      // The point of the bulk action: a month of rule matches should cost one
      // click and one round trip, not one of each per transaction.
      seedUser({
        categories,
        transactions: [
          makeTransaction({ id: 'a', Category: 'Groceries', hasRule: true }),
          makeTransaction({ id: 'b', Category: 'Gas', hasRule: true }),
        ],
      });
      const { user } = await renderPage(<Review />, { route: '/review' });

      const before = fakeDb.writes().length;
      await user.click(screen.getByRole('button', { name: /Accept all/ }));

      await waitFor(() => {
        expect(storedTransactions().every((t) => t.confirmed)).toBe(true);
      });
      expect(fakeDb.writes().length).toBe(before + 1);
    });
  });

  describe('transactions needing a decision', () => {
    const seedAmazon = () =>
      seedUser({
        categories,
        transactions: [
          makeTransaction({
            id: 'amz',
            Description: 'AMAZON MKTPL*MP6CQ6F53',
            suggestedCategory: 'Groceries',
            suggestionConfidence: 'low',
          }),
        ],
      });

    it('offers the suggestion and saves a rule when confirmed', async () => {
      seedAmazon();
      const { user } = await renderPage(<Review />, { route: '/review' });
      expect(pageText()).toContain('suggested Groceries');

      await user.click(screen.getByRole('button', { name: /Confirm/ }));

      await waitFor(() => {
        const [stored] = storedTransactions();
        expect(stored.Category).toBe('Groceries');
        expect(stored.confirmed).toBe(true);
      });
      // The rule pattern drops the reference code, so the next order matches.
      expect(Object.values(storedRules())).toEqual([
        expect.objectContaining({ matchText: 'amazon mktpl', category: 'Groceries' }),
      ]);
    });

    it('saves no rule when the offer is declined', async () => {
      seedAmazon();
      const { user } = await renderPage(<Review />, { route: '/review' });

      await user.click(screen.getByRole('checkbox', { name: /Always use this for/ }));
      await user.click(screen.getByRole('button', { name: /Confirm/ }));

      await waitFor(() => {
        expect(storedTransactions()[0].confirmed).toBe(true);
      });
      expect(Object.keys(storedRules())).toHaveLength(0);
    });

    it('saves the edited pattern rather than the suggested one', async () => {
      seedAmazon();
      const { user } = await renderPage(<Review />, { route: '/review' });

      const pattern = screen.getByLabelText(/Rule pattern for/);
      await user.clear(pattern);
      await user.type(pattern, 'amazon');
      await user.click(screen.getByRole('button', { name: /Confirm/ }));

      await waitFor(() => {
        expect(Object.values(storedRules())).toEqual([
          expect.objectContaining({ matchText: 'amazon' }),
        ]);
      });
    });

    it('clears the suggestion so the row does not come back', async () => {
      seedAmazon();
      const { user } = await renderPage(<Review />, { route: '/review' });
      await user.click(screen.getByRole('button', { name: /Confirm/ }));

      await waitFor(() => {
        expect(storedTransactions()[0].suggestedCategory).toBeFalsy();
      });
      expect(pageText()).toContain('Nothing to review');
    });
  });

  describe('transactions with no match', () => {
    it('will not confirm until a category is chosen', async () => {
      seedUser({
        categories,
        transactions: [makeTransaction({ id: 'x', Description: 'MYSTERY SHOP' })],
      });
      await renderPage(<Review />, { route: '/review' });

      // jest-dom is not set up in this project, so assert on the property.
      const confirm = screen.getByRole('button', { name: /Confirm/ }) as HTMLButtonElement;
      expect(confirm.disabled).toBe(true);
      expect(pageText()).toContain('No match');
    });
  });
});
