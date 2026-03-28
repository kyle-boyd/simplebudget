import { useState, useEffect } from 'react';
import { ref, onValue, set, update } from 'firebase/database';
import { db, auth } from '@/lib/firebase';
import { Transaction } from './useTransactions';
import { createTransactionId, parseDate } from '@/lib/utils';
import { TellerAuthorization } from './useTellerConnect';

export interface BankAccount {
  id: string;             // Teller account ID
  enrollmentId: string;
  accessToken: string;
  institutionName: string;
  name: string;
  type: string;           // depository, credit, etc.
  subtype: string;        // checking, savings, etc.
  lastSyncAt: string | null;
}

const TELLER_API = '/teller-api';

async function tellerHeaders(tellerAccessToken: string): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const idToken = await user.getIdToken();
  return {
    Authorization: `Bearer ${idToken}`,
    'x-teller-token': tellerAccessToken,
  };
}

interface TellerAccount {
  id: string;
  name: string;
  type: string;
  subtype: string;
  institution: { name: string };
  enrollment_id: string;
}

interface TellerTransaction {
  id: string;
  date: string;
  description: string;
  amount: string;
  status: 'posted' | 'pending';
  type: string;
  details?: {
    category?: string;
  };
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

  const connectAccounts = async (authorization: TellerAuthorization): Promise<void> => {
    if (!userId) return;

    const response = await fetch(`${TELLER_API}/accounts`, {
      headers: await tellerHeaders(authorization.accessToken),
    });

    if (!response.ok) {
      throw new Error(`Teller API error: ${response.status}`);
    }

    const tellerAccounts: TellerAccount[] = await response.json();

    for (const account of tellerAccounts) {
      const bankAccount: BankAccount = {
        id: account.id,
        enrollmentId: authorization.enrollment.id,
        accessToken: authorization.accessToken,
        institutionName: account.institution.name,
        name: account.name,
        type: account.type,
        subtype: account.subtype,
        lastSyncAt: null,
      };
      await set(ref(db, `users/${userId}/bankAccounts/${account.id}`), bankAccount);
    }
  };

  const syncTransactions = async (account: BankAccount): Promise<Transaction[]> => {
    const response = await fetch(`${TELLER_API}/accounts/${account.id}/transactions`, {
      headers: await tellerHeaders(account.accessToken),
    });

    if (!response.ok) {
      throw new Error(`Teller API error: ${response.status}`);
    }

    const tellerTransactions: TellerTransaction[] = await response.json();

    const transactions: Transaction[] = tellerTransactions
      .filter((t) => t.status === 'posted')
      .map((t) => {
        const amount = parseFloat(t.amount);
        const date = parseDate(t.date);
        return {
          id: createTransactionId({ Date: date, Description: t.description, Amount: amount }),
          Date: date,
          Amount: amount,
          Description: t.description,
          Category: t.details?.category || undefined,
          confirmed: false,
          bankAccountId: account.id,
        };
      });

    if (userId) {
      await update(ref(db, `users/${userId}/bankAccounts/${account.id}`), {
        lastSyncAt: new Date().toISOString(),
      });
    }

    return transactions;
  };

  const removeAccount = async (accountId: string): Promise<void> => {
    if (!userId) return;
    await set(ref(db, `users/${userId}/bankAccounts/${accountId}`), null);
  };

  return { bankAccounts, loading, connectAccounts, syncTransactions, removeAccount };
}
