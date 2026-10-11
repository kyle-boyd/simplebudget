import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ref, get, update } from 'firebase/database';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency as formatCurrencyWith } from '@/lib/utils';

export interface UserSettings {
  currency?: string;
  displayName?: string;
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'C$',
  AUD: 'A$',
  JPY: '¥',
};

export const DEFAULT_CURRENCY = 'USD';

interface SettingsContextValue {
  settings: UserSettings;
  loading: boolean;
  error: string | null;
  updateSettings: (partial: Partial<UserSettings>) => Promise<void>;
  currency: string;
  currencySymbol: string;
  formatCurrency: (amount: number) => string;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.uid ?? null;

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

    let active = true;
    setLoading(true);
    setError(null);

    get(ref(db, `users/${userId}/settings`))
      .then((snapshot) => {
        if (!active) return;
        setSettings(snapshot.exists() ? (snapshot.val() as UserSettings) : {});
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load settings');
        setSettings({});
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const updateSettings = useCallback(
    async (partial: Partial<UserSettings>) => {
      if (!userId) return;
      setError(null);
      await update(ref(db, `users/${userId}/settings`), partial);
      setSettings((prev) => ({ ...prev, ...partial }));
    },
    [userId]
  );

  const value = useMemo<SettingsContextValue>(() => {
    const currency = settings.currency || DEFAULT_CURRENCY;
    return {
      settings,
      loading,
      error,
      updateSettings,
      currency,
      currencySymbol: CURRENCY_SYMBOLS[currency] ?? '$',
      formatCurrency: (amount: number) => formatCurrencyWith(amount, currency),
    };
  }, [settings, loading, error, updateSettings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

function useSettingsContext(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useUserSettings must be used inside a <SettingsProvider>');
  }
  return context;
}

export function useUserSettings() {
  const { settings, loading, error, updateSettings } = useSettingsContext();
  return { settings, loading, error, updateSettings };
}

/** Currency formatting bound to the user's saved preference. */
export function useCurrency() {
  const { currency, currencySymbol, formatCurrency } = useSettingsContext();
  return { currency, currencySymbol, formatCurrency };
}
