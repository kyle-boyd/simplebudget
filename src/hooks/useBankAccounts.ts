import { useState, useEffect } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db } from '@/lib/firebase';

/**
 * Read-only access to previously connected bank accounts.
 *
 * These records were created by the Teller bank sync, which was removed when
 * Teller shut down its API; transactions are imported from CSV now. Nothing
 * writes new accounts, but existing ones are still read so that already
 * imported transactions keep showing which account they came from (the Account
 * column, and the transactions search), and so a stale account can be removed.
 *
 * Stored records may still carry dead `accessToken` / `enrollmentId` fields.
 * They are deliberately absent from this type so nothing can depend on them.
 */
export interface BankAccount {
  id: string;
  institutionName: string;
  name: string;
  type: string;           // depository, credit, etc.
  subtype: string;        // checking, savings, etc.
}

export function useBankAccounts(userId: string | null) {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setBankAccounts([]);
      setLoading(false);
      return;
    }

    const accountsRef = ref(db, `users/${userId}/bankAccounts`);
    const unsubscribe = onValue(accountsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val() as Record<string, BankAccount>;
        setBankAccounts(Object.values(data));
      } else {
        setBankAccounts([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const removeAccount = async (accountId: string): Promise<void> => {
    if (!userId) return;
    await set(ref(db, `users/${userId}/bankAccounts/${accountId}`), null);
  };

  return { bankAccounts, loading, removeAccount };
}
