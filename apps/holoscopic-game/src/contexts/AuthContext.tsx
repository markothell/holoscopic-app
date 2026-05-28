'use client';

import { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

interface AuthContextType {
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userRole: string | null;
  holonBalance: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  refreshBalance: () => void;
}

const AuthContext = createContext<AuthContextType>({
  userId: null,
  userEmail: null,
  userName: null,
  userRole: null,
  holonBalance: null,
  isAuthenticated: false,
  isLoading: true,
  refreshBalance: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [userId, setUserId] = useState<string | null>(null);
  const [holonBalance, setHolonBalance] = useState<number | null>(null);

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      setUserId((session.user as any).id);
    } else if (status === 'unauthenticated') {
      setUserId(null);
      setHolonBalance(null);
    }
  }, [session, status]);

  const refreshBalance = async () => {
    if (!userId || status !== 'authenticated') return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/holons/balance`,
        { headers: { 'x-user-id': userId } }
      );
      if (res.ok) {
        const data = await res.json();
        setHolonBalance(data.balance);
      }
    } catch {}
  };

  useEffect(() => {
    if (userId && status === 'authenticated') refreshBalance();
  }, [userId, status]);

  return (
    <AuthContext.Provider value={{
      userId,
      userEmail: session?.user?.email || null,
      userName: session?.user?.name || null,
      userRole: (session?.user as any)?.role || null,
      holonBalance,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      refreshBalance,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
