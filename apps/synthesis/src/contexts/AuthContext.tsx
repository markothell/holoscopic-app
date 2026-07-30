'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { SessionProvider, useSession, signOut } from 'next-auth/react';
import { clearGameToken } from '@/services/api';

// Holoscopic account session → the identity every Synthesis request carries.
// A member's pseudonymous "handle" within a community is a separate,
// community-scoped concept (D3) layered on top of this account identity —
// not modeled here in M0.
interface AuthContextType {
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  userId: null,
  userName: null,
  userEmail: null,
  isAuthenticated: false,
  isLoading: true,
  logout: () => {},
});

function AuthState({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const user = session?.user as { id?: string; name?: string | null; email?: string | null } | undefined;

  return (
    <AuthContext.Provider
      value={{
        userId: user?.id ?? null,
        userName: user?.name || user?.email?.split('@')[0] || null,
        userEmail: user?.email ?? null,
        isAuthenticated: status === 'authenticated',
        isLoading: status === 'loading',
        logout: () => {
          clearGameToken();
          signOut({ callbackUrl: '/' });
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthState>{children}</AuthState>
    </SessionProvider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
