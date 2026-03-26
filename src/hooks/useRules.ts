import { useState, useEffect } from 'react';
import { ref, onValue, set, push, remove } from 'firebase/database';
import { db } from '@/lib/firebase';

export interface Rule {
  id: string;
  matchText: string;
  category: string;
  createdAt: string;
}

export function useRules(userId: string | null) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setRules([]);
      setLoading(false);
      return;
    }

    const rulesRef = ref(db, `users/${userId}/rules`);
    const unsubscribe = onValue(rulesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const rulesArray = Object.entries(data).map(([key, val]: [string, any]) => ({
          ...val,
          id: key,
        }));
        setRules(rulesArray);
      } else {
        setRules([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const addRule = async (rule: Omit<Rule, 'id'>) => {
    if (!userId) return null;
    const rulesRef = ref(db, `users/${userId}/rules`);
    const newRef = push(rulesRef);
    await set(newRef, rule);
    return newRef.key;
  };

  const updateRule = async (ruleId: string, updates: Partial<Omit<Rule, 'id'>>) => {
    if (!userId) return;
    const existing = rules.find(r => r.id === ruleId);
    if (!existing) return;
    const { id: _id, ...rest } = existing;
    const ruleRef = ref(db, `users/${userId}/rules/${ruleId}`);
    await set(ruleRef, { ...rest, ...updates });
  };

  const deleteRule = async (ruleId: string) => {
    if (!userId) return;
    const ruleRef = ref(db, `users/${userId}/rules/${ruleId}`);
    await remove(ruleRef);
  };

  const findConflict = (matchText: string): Rule | null => {
    const normalized = matchText.trim().toLowerCase();
    return rules.find(r => r.matchText.trim().toLowerCase() === normalized) || null;
  };

  return { rules, loading, addRule, updateRule, deleteRule, findConflict };
}
