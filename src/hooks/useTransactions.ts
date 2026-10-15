import { useCallback, useState, useEffect } from 'react';
import { ref, onValue, get, update } from 'firebase/database';
import { db } from '@/lib/firebase';

export interface Transaction {
  id: string;
  Date: string;
  Amount: number;
  Description: string;
  Category?: string;
  importedCategory?: string;
  confirmed?: boolean;
  hasRule?: boolean;
  bankAccountId?: string;
  /**
   * Direction of the money, derived from the CSV `Type` column on import
   * (`Debit` → `out`, `Credit` → `in`). Amounts are stored as positive
   * magnitudes, so this is the only reliable signal that a row is income, a
   * transfer, or a refund rather than spending. Left `undefined` for rows
   * imported before this existed (and files with no `Type` column), which are
   * treated as spending so nothing silently drops out of existing totals.
   */
  flow?: 'in' | 'out';
  /**
   * A proposed category awaiting review, written by an `alwaysReview` rule on
   * import. Deliberately separate from `Category`: a suggestion must not reach
   * budget totals until it is accepted on the review screen.
   */
  suggestedCategory?: string;
  suggestionConfidence?: 'high' | 'low';
}

/**
 * Serialises edits per user. Module level rather than a ref, so separate
 * `useTransactions` callers on the same screen share one queue.
 *
 * The tail resolves to the list as written by the last mutation, or `null` when
 * the chain is idle (nothing queued yet, or the previous mutation failed). The
 * next mutation reuses that list instead of re-reading, so a chain of rapid
 * edits never depends on a read reflecting the write just before it.
 */
const mutationQueues = new Map<string, Promise<Transaction[] | null>>();

function queueFor(userId: string): Promise<Transaction[] | null> {
  return mutationQueues.get(userId) ?? Promise.resolve(null);
}

function toTransactionArray(value: unknown): Transaction[] {
  if (!value) return [];
  const array = Array.isArray(value) ? value : Object.values(value as Record<string, Transaction>);
  return array.filter((transaction): transaction is Transaction => !!transaction);
}

export function useTransactions(userId: string | null) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    const transactionsRef = ref(db, `users/${userId}/transactions`);

    const unsubscribe = onValue(transactionsRef, (snapshot) => {
      setTransactions(toTransactionArray(snapshot.val()));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const saveTransactions = useCallback(async (newTransactions: Transaction[]) => {
    if (!userId) return;
    // One write so the list and its timestamp can't disagree.
    await update(ref(db, `users/${userId}`), {
      transactions: newTransactions,
      lastUpdated: new Date().toISOString(),
    });
  }, [userId]);

  /**
   * Applies `mutate` to the stored list as a read-modify-write.
   *
   * Three things are load-bearing here. It never builds the next list from the
   * rendered copy, which only catches up after a write round-trips. It queues
   * behind any mutation already in progress for this user: because the whole
   * list is written at once, two overlapping read-modify-writes would both start
   * from the same "before" state and the second would discard the first's edit.
   * And once the chain is running it threads each mutation's result straight
   * into the next rather than re-reading — a `get()` issued right after a write
   * can still lag that write (the local cache syncs behind the server ack), so
   * re-reading would feed a stale base back in and silently drop edits made in a
   * rapid burst. Only the first mutation of an idle chain reads from the DB.
   */
  const mutateTransactions = useCallback(async (
    mutate: (current: Transaction[]) => Transaction[]
  ) => {
    if (!userId) return;

    const run = queueFor(userId).then(async (previous) => {
      const current = previous ?? toTransactionArray((await get(ref(db, `users/${userId}/transactions`))).val());
      const next = mutate(current);
      await saveTransactions(next);
      return next;
    });

    // A failed mutation must not wedge the queue for every later one; resetting
    // the tail to null makes the next mutation re-read the (rolled-back) list.
    const tail = run.catch(() => null);
    mutationQueues.set(userId, tail);

    // Once this burst has fully drained, forget the cached list so the next
    // interaction reads fresh from the DB — threading in memory only needs to
    // survive a back-to-back burst, not stand in for the DB indefinitely.
    tail.then(() => {
      if (mutationQueues.get(userId) === tail) mutationQueues.delete(userId);
    });

    return run;
  }, [userId, saveTransactions]);

  const addTransactions = useCallback(async (newTransactions: Transaction[]) => {
    if (!userId || newTransactions.length === 0) return 0;

    let added = 0;
    await mutateTransactions((existing) => {
      const existingIds = new Set(existing.map((transaction) => transaction.id));
      const uniqueNew = newTransactions.filter((transaction) => !existingIds.has(transaction.id));
      added = uniqueNew.length;
      return uniqueNew.length > 0 ? [...uniqueNew, ...existing] : existing;
    });

    return added;
  }, [userId, mutateTransactions]);

  const updateTransaction = useCallback(async (
    transactionId: string,
    updates: Partial<Transaction>
  ) => {
    await mutateTransactions((current) =>
      current.map((transaction) =>
        transaction.id === transactionId ? { ...transaction, ...updates } : transaction
      )
    );
  }, [mutateTransactions]);

  const toggleConfirm = useCallback(async (transactionId: string) => {
    await mutateTransactions((current) =>
      current.map((transaction) =>
        transaction.id === transactionId
          ? { ...transaction, confirmed: !transaction.confirmed }
          : transaction
      )
    );
  }, [mutateTransactions]);

  const deleteTransactionsByAccount = useCallback(async (accountId: string) => {
    await mutateTransactions((current) =>
      current.filter((transaction) => transaction.bankAccountId !== accountId)
    );
  }, [mutateTransactions]);

  return {
    transactions,
    loading,
    // saveTransactions is deliberately not exposed: callers that build the next
    // list from the rendered copy drop concurrent edits. Use mutateTransactions.
    mutateTransactions,
    addTransactions,
    updateTransaction,
    toggleConfirm,
    deleteTransactionsByAccount,
  };
}
