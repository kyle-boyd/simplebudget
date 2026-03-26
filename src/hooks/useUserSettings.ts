import { useState, useEffect, useCallback } from 'react';
import { ref, get, update } from 'firebase/database';
import { db } from '@/lib/firebase';

export interface UserSettings {
  currency?: string;
  dateFormat?: string;
  displayName?: string;
}

export function useUserSettings(userId: string | null) {
  const [settings, setSettings] = useState<UserSettings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setSettings({});
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const settingsRef = ref(db, `users/${userId}/settings`);

    get(settingsRef)
      .then((snapshot) => {
        if (snapshot.exists()) {
          setSettings(snapshot.val() as UserSettings);
        } else {
          setSettings({});
        }
      })
      .catch((err) => {
        setError(err.message);
        setSettings({});
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const updateSettings = useCallback(
    async (partial: Partial<UserSettings>) => {
      if (!userId) return;
      setError(null);
      const settingsRef = ref(db, `users/${userId}/settings`);
      await update(settingsRef, partial);
      setSettings((prev) => ({ ...prev, ...partial }));
    },
    [userId]
  );

  return { settings, loading, error, updateSettings };
}
