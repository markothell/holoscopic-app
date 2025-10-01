'use client';

import { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

interface AuthContextType {
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userRole: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  userId: null,
  userEmail: null,
  userName: null,
  userRole: null,
  isAuthenticated: false,
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      // Authenticated: use real user ID
      setUserId((session.user as any).id);
    } else if (status === 'unauthenticated') {
      // Not authenticated: use or generate anonymous localStorage ID
      const anonId = localStorage.getItem('anonUserId');
      if (anonId) {
        setUserId(anonId);
      } else {
        const newAnonId = `anon_${Math.random().toString(36).substring(2, 10)}`;
        localStorage.setItem('anonUserId', newAnonId);
        setUserId(newAnonId);
      }
    }
  }, [session, status]);

  return (
    <AuthContext.Provider
      value={{
        userId,
        userEmail: session?.user?.email || null,
        userName: session?.user?.name || null,
        userRole: (session?.user as any)?.role || null,
        isAuthenticated: status === 'authenticated',
        isLoading: status === 'loading',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
