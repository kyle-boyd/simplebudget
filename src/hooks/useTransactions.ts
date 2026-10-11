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
}

/**
 * Serialises edits per user. Module level rather than a ref, so separate
 * `useTransactions` callers on the same screen share one queue.
 */
const mutationQueues = new Map<string, Promise<unknown>>();

function queueFor(userId: string): Promise<unknown> {
  return mutationQueues.get(userId) ?? Promise.resolve();
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
   * Two things are load-bearing here. It reads from the database rather than the
   * rendered copy, which only catches up after a write round-trips. And it
   * queues behind any mutation already in progress for this user: because the
   * whole list is written at once, two overlapping read-modify-writes would both
   * read the same "before" state and the second would discard the first's edit.
   */
  const mutateTransactions = useCallback(async (
    mutate: (current: Transaction[]) => Transaction[]
  ) => {
    if (!userId) return;

    const run = queueFor(userId).then(async () => {
      const snapshot = await get(ref(db, `users/${userId}/transactions`));
      await saveTransactions(mutate(toTransactionArray(snapshot.val())));
    });

    // A failed mutation must not wedge the queue for every later one.
    mutationQueues.set(userId, run.catch(() => {}));

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
