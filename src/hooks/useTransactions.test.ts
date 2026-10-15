import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useTransactions } from './useTransactions';
import * as rtdb from '@/test/fakes/firebase-database';
import { fakeDb } from '@/test/fakes/firebase-database';
import { TEST_UID, makeTransaction, seedUser, storedTransactions } from '@/test/factories';
import { TEST_NOW } from '@/test/setup';

async function mountHook(transactions = [makeTransaction({ id: 'a' }), makeTransaction({ id: 'b' })]) {
  seedUser({ transactions });
  const view = renderHook(() => useTransactions(TEST_UID));
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('useTransactions', () => {
  it('reads the stored list', async () => {
    const { result } = await mountHook();
    expect(result.current.transactions.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('reports an empty list without a user', async () => {
    const { result } = renderHook(() => useTransactions(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.transactions).toEqual([]);
  });

  describe('updateTransaction', () => {
    it('writes the change', async () => {
      const { result } = await mountHook();
      await act(async () => {
        await result.current.updateTransaction('a', { Category: 'Groceries' });
      });
      expect(storedTransactions().find((t) => t.id === 'a')?.Category).toBe('Groceries');
    });

    it('keeps an edit made while a previous write was still in flight', async () => {
      // Regression: each edit rebuilt the whole list from the rendered copy,
      // which only refreshes after the write round-trips. Editing two rows in
      // quick succession silently discarded the first.
      const { result } = await mountHook();

      await act(async () => {
        await Promise.all([
          result.current.updateTransaction('a', { Category: 'Groceries' }),
          result.current.updateTransaction('b', { Category: 'Gas' }),
        ]);
      });

      const stored = storedTransactions();
      expect(stored.find((t) => t.id === 'a')?.Category).toBe('Groceries');
      expect(stored.find((t) => t.id === 'b')?.Category).toBe('Gas');
    });

    it('keeps every edit in a rapid burst even when get() lags the last write', async () => {
      // Regression: the per-user queue serialised edits but each one re-read the
      // list with get(). In the real SDK get() can return a value that still
      // lags the write just before it (the local cache syncs behind the server
      // ack), so a burst of edits all started from the same stale base and every
      // edit but the last was silently dropped — "it briefly showed as done,
      // then reverted". Model that here: get() always returns the seeded list.
      const txns = [
        makeTransaction({ id: 'a' }),
        makeTransaction({ id: 'b' }),
        makeTransaction({ id: 'c' }),
      ];
      const stale = txns.map((t) => ({ ...t }));
      const spy = vi.spyOn(rtdb, 'get').mockResolvedValue({
        exists: () => true,
        val: () => stale,
        key: 'transactions',
      } as never);

      const { result } = await mountHook(txns);

      // Fire-and-forget, the way the table's onClick handlers call these.
      await act(async () => {
        result.current.updateTransaction('a', { Category: 'Groceries' });
        result.current.toggleConfirm('b');
        result.current.updateTransaction('c', { Category: 'Gas' });
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const stored = storedTransactions();
      expect(stored.find((t) => t.id === 'a')?.Category).toBe('Groceries');
      expect(stored.find((t) => t.id === 'b')?.confirmed).toBe(true);
      expect(stored.find((t) => t.id === 'c')?.Category).toBe('Gas');
      spy.mockRestore();
    });

    it('leaves other transactions untouched', async () => {
      const { result } = await mountHook();
      await act(async () => {
        await result.current.updateTransaction('a', { Category: 'Groceries' });
      });
      expect(storedTransactions().find((t) => t.id === 'b')?.Category).toBeUndefined();
    });
  });

  describe('toggleConfirm', () => {
    it('flips confirmed on and back off', async () => {
      const { result } = await mountHook();

      await act(async () => {
        await result.current.toggleConfirm('a');
      });
      expect(storedTransactions().find((t) => t.id === 'a')?.confirmed).toBe(true);

      await act(async () => {
        await result.current.toggleConfirm('a');
      });
      expect(storedTransactions().find((t) => t.id === 'a')?.confirmed).toBeFalsy();
    });

    it('does not lose a concurrent confirm on another row', async () => {
      const { result } = await mountHook();
      await act(async () => {
        await Promise.all([result.current.toggleConfirm('a'), result.current.toggleConfirm('b')]);
      });
      expect(storedTransactions().filter((t) => t.confirmed)).toHaveLength(2);
    });
  });

  describe('addTransactions', () => {
    it('prepends new transactions and reports how many landed', async () => {
      const { result } = await mountHook();
      let added = 0;
      await act(async () => {
        added = (await result.current.addTransactions([makeTransaction({ id: 'c' })])) ?? 0;
      });
      expect(added).toBe(1);
      expect(storedTransactions().map((t) => t.id)).toEqual(['c', 'a', 'b']);
    });

    it('skips transactions already stored, so re-importing a CSV is safe', async () => {
      const { result } = await mountHook();
      let added = 0;
      await act(async () => {
        added = (await result.current.addTransactions([
          makeTransaction({ id: 'a' }),
          makeTransaction({ id: 'c' }),
        ])) ?? 0;
      });
      expect(added).toBe(1);
      expect(storedTransactions()).toHaveLength(3);
    });

    it('writes nothing when every transaction is a duplicate', async () => {
      const { result } = await mountHook();
      const before = fakeDb.writes().length;
      await act(async () => {
        await result.current.addTransactions([makeTransaction({ id: 'a' })]);
      });
      expect(storedTransactions()).toHaveLength(2);
      expect(fakeDb.writes().length).toBe(before + 1); // one read-modify-write, no growth
    });

    it('ignores an empty batch', async () => {
      const { result } = await mountHook();
      const before = fakeDb.writes().length;
      await act(async () => {
        await result.current.addTransactions([]);
      });
      expect(fakeDb.writes().length).toBe(before);
    });
  });

  describe('deleteTransactionsByAccount', () => {
    it('removes only that account and leaves manual imports alone', async () => {
      const { result } = await mountHook([
        makeTransaction({ id: 'bank1', bankAccountId: 'acct-1' }),
        makeTransaction({ id: 'bank2', bankAccountId: 'acct-2' }),
        makeTransaction({ id: 'manual' }),
      ]);
      await act(async () => {
        await result.current.deleteTransactionsByAccount('acct-1');
      });
      expect(storedTransactions().map((t) => t.id)).toEqual(['bank2', 'manual']);
    });
  });

  it('records a lastUpdated timestamp alongside the list, in one write', async () => {
    const { result } = await mountHook();
    await act(async () => {
      await result.current.updateTransaction('a', { Category: 'Groceries' });
    });
    expect(fakeDb.read(`users/${TEST_UID}/lastUpdated`)).toBe(TEST_NOW.toISOString());
    // A single update() at the user node, not one write per field.
    expect(fakeDb.writes().filter((w) => w.op === 'update')).toHaveLength(1);
  });
});
