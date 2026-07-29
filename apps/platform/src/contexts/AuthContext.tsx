'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

// The stored session. The backend's requireAdmin no longer accepts a bare
// x-user-id header — a header is not a credential — so this app exchanges
// credentials for a signed 12h token via /auth/admin-token and sends it as a
// bearer on every request (see lib/api.ts).
interface StoredSession {
  user: AuthUser;
  token: string;
  expiresAt: number;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => {},
  logout: () => {},
});

const STORAGE_KEY = 'hs_platform_user';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const session: StoredSession = JSON.parse(stored);
        // A stored session whose token has expired is not a session. Without
        // this the UI renders as signed in and every call 401s.
        if (session.token && session.expiresAt > Date.now()) {
          setUser(session.user);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const res = await fetch(`${API_URL}/auth/admin-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    // /auth/admin-token returns one indistinguishable error for bad
    // credentials and for a valid non-admin, so there is no role check to do
    // here — the backend already refused to issue a token.
    if (!res.ok) throw new Error(data.error || 'Login failed');

    const session: StoredSession = {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role,
      },
      token: data.token,
      expiresAt: data.expiresAt,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    setUser(session.user);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
