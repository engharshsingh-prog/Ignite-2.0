import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  auth,
  signInWithGoogle,
  signOutFirebaseUser,
  onAuthStateChanged,
  type User,
} from '../lib/firebase';

interface UserAuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  loginWithGoogle: () => Promise<User | null>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const UserAuthContext = createContext<UserAuthContextType | undefined>(undefined);

export function UserAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUser(firebaseUser);
        setLoading(false);
      },
      (err) => {
        console.error('Firebase Auth state error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async (): Promise<User | null> => {
    setError(null);
    try {
      const loggedInUser = await signInWithGoogle();
      setUser(loggedInUser);
      return loggedInUser;
    } catch (err: unknown) {
      const firebaseError = err as { code?: string; message?: string };
      if (firebaseError?.code === 'auth/popup-closed-by-user') {
        setError('Sign in popup was closed before completion.');
      } else if (firebaseError?.code === 'auth/cancelled-popup-request') {
        // Ignored duplicate popup
      } else if (firebaseError?.code === 'auth/network-request-failed') {
        setError('Network error during Google sign in. Please check your connection.');
      } else {
        setError(firebaseError?.message || 'Failed to sign in with Google');
      }
      return null;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await signOutFirebaseUser();
      setUser(null);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to sign out';
      setError(errorMsg);
    }
  };

  const clearError = () => setError(null);

  return (
    <UserAuthContext.Provider
      value={{
        user,
        loading,
        error,
        loginWithGoogle,
        logout,
        clearError,
      }}
    >
      {children}
    </UserAuthContext.Provider>
  );
}

export function useUserAuth() {
  const context = useContext(UserAuthContext);
  if (!context) {
    throw new Error('useUserAuth must be used within a UserAuthProvider');
  }
  return context;
}

