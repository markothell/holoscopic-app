'use client';

import { createContext, useContext, ReactNode, useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
// Type-only: erased at compile time, so it does not pull the runtime library
// into the bundle. The implementation is imported on demand below.
import type { Socket } from 'socket.io-client';
import { useInstance } from '@/contexts/InstanceContext';
import { HolonService } from '@/services/holonService';
import { getGameToken } from '@/lib/api';

interface AuthContextType {
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userRole: string | null;
  holonBalance: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  refreshBalance: () => void;
  socket: Socket | null;
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
  socket: null,
});

const SOCKET_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const { instance, isLoading: instanceLoading } = useInstance();
  const [userId, setUserId] = useState<string | null>(null);
  const [holonBalance, setHolonBalance] = useState<number | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // Balance is per-instance: track the current instance for socket filtering
  const instanceIdRef = useRef<string | null>(null);
  useEffect(() => { instanceIdRef.current = instance?.id ?? null; }, [instance?.id]);

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
      setHolonBalance(await HolonService.getBalance(userId));
    } catch {}
  };

  // Fetch once the instance is resolved (the balance is scoped to it), and
  // refetch whenever the user moves to a different instance.
  useEffect(() => {
    if (userId && status === 'authenticated' && !instanceLoading) refreshBalance();
  }, [userId, status, instance?.id, instanceLoading]);

  // Persistent socket for user-level events (holon updates)
  useEffect(() => {
    if (!userId || status !== 'authenticated') {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    let cancelled = false;
    let sock: Socket | null = null;

    // socket.io-client (plus engine.io-client) is loaded here rather than at
    // module scope. Only an authenticated session ever opens a socket, but
    // AuthProvider wraps every page from the root layout — so a static import
    // put the whole library in the first load of the marketing homepage, the
    // manifesto, and every other logged-out page that will never use it.
    import('socket.io-client').then(({ io: socketIO }) => {
      if (cancelled) return;

      // The handshake carries the same identity token as HTTP calls. The server
      // reads the personal room from it and ignores anything the client claims,
      // so without a token there is no holon/notification push. `auth` may be a
      // function, which socket.io re-invokes on every reconnect — that matters
      // because the token expires in 15 minutes and reconnects outlive it.
      sock = socketIO(SOCKET_URL, {
        transports: ['websocket'],
        upgrade: false,
        auth: (cb) => { getGameToken().then((token) => cb({ token })); },
      });
      socketRef.current = sock;

      sock.on('connect', () => {
        if (cancelled || !sock) return;
        sock.emit('join_user_room');
        setSocket(sock);
      });

      sock.on('holon_update', ({ balance, instanceId }: { balance: number; instanceId?: string }) => {
        // Only apply updates for the instance currently being viewed
        if (!instanceId || instanceId === instanceIdRef.current) setHolonBalance(balance);
      });
    }).catch((error) => {
      // Balance and notifications fall back to their fetch-on-mount paths.
      console.error('[AuthContext] socket.io-client failed to load:', error);
    });

    return () => {
      cancelled = true;
      sock?.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
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
      socket,
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
