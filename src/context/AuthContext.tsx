// AuthContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState, useRef } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config';
import { saveFormForUser } from '../services/forms';
import type { FormData } from '../components/FormRenderer';

type AuthContextValue = {
  user: User | null;
  initializing: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  // Guard to ensure we only attempt restore once per session
  const restoringRef = useRef(false);
  // LocalStorage key used by UnifiedEditor for the anonymous "save-to-login" workflow
  const UNSAVED_FORM_LOCAL_KEY = 'instantform:unsavedForm';

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setInitializing(false);
    });
    return () => unsub();
  }, []);

  // After successful login, if there is an anonymous draft stored locally,
  // automatically save it to the new account and redirect to its editor.
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(UNSAVED_FORM_LOCAL_KEY);
      if (!raw) return;
      if (restoringRef.current) return;
      restoringRef.current = true;

      (async () => {
        try {
          const draft = JSON.parse(raw) as FormData;
          const newId = await saveFormForUser(user.uid, draft);
          try { localStorage.removeItem(UNSAVED_FORM_LOCAL_KEY); } catch {}
          // Redirect to the editor of the newly saved form
          window.location.assign(`/form/${newId}/edit`);
        } catch {
          // Allow another attempt on next auth change if saving failed
          restoringRef.current = false;
        }
      })();
    } catch {
      // If localStorage access fails, do nothing
    }
  }, [user]);

  const loginWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user, initializing, loginWithGoogle, logout }),
    [user, initializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};

export default AuthContext;