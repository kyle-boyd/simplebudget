import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  User,
  UserCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserCredential>;
  signup: (email: string, password: string, displayName?: string) => Promise<UserCredential>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the single `onAuthStateChanged` subscription for the app. Every page,
 * the sidebar and the route guards all need the current user; subscribing per
 * caller meant a listener (and an independent loading flicker) for each one.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login: (email, password) => signInWithEmailAndPassword(auth, email, password),
    signup: async (email, password, displayName) => {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const trimmed = displayName?.trim();
      if (trimmed) {
        // updateProfile doesn't re-fire onAuthStateChanged, so publish it ourselves.
        await updateProfile(credential.user, { displayName: trimmed });
        setUser(auth.currentUser);
      }
      return credential;
    },
    logout: () => signOut(auth),
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return context;
}
