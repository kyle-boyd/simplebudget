import { useState, useEffect } from 'react';
import { ref, onValue, set, get } from 'firebase/database';
import { db } from '@/lib/firebase';
import { createTransactionId } from '@/lib/utils';

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
      if (snapshot.exists()) {
        const data = snapshot.val();
        const transactionsArray = Array.isArray(data) ? data : Object.values(data);
        setTransactions(transactionsArray as Transaction[]);
      } else {
        setTransactions([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const saveTransactions = async (newTransactions: Transaction[]) => {
    if (!userId) return;
    
    const transactionsRef = ref(db, `users/${userId}/transactions`);
    const lastUpdatedRef = ref(db, `users/${userId}/lastUpdated`);
    
    await set(transactionsRef, newTransactions);
    await set(lastUpdatedRef, new Date().toLocaleDateString());
  };

  const addTransactions = async (newTransactions: Transaction[]) => {
    if (!userId) return;
    const snapshot = await get(ref(db, `users/${userId}/transactions`));
    const existing: Transaction[] = snapshot.exists()
      ? (Array.isArray(snapshot.val()) ? snapshot.val() : Object.values(snapshot.val()))
      : [];
    const existingIds = new Set(existing.map((t: Transaction) => t.id));
    const uniqueNew = newTransactions.filter(t => !existingIds.has(t.id));
    if (uniqueNew.length > 0) {
      await saveTransactions([...uniqueNew, ...existing]);
    }
  };

  const updateTransaction = async (transactionId: string, updates: Partial<Transaction>) => {
    const updated = transactions.map(t => 
      t.id === transactionId ? { ...t, ...updates } : t
    );
    await saveTransactions(updated);
  };

  const toggleConfirm = async (transactionId: string) => {
    const transaction = transactions.find(t => t.id === transactionId);
    if (transaction) {
      await updateTransaction(transactionId, { confirmed: !transaction.confirmed });
    }
  };

  const deleteTransactionsByAccount = async (accountId: string) => {
    await saveTransactions(transactions.filter(t => t.bankAccountId !== accountId));
  };

  return {
    transactions,
    loading,
    saveTransactions,
    addTransactions,
    updateTransaction,
    toggleConfirm,
    deleteTransactionsByAccount,
  };
}

