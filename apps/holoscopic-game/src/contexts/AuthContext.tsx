'use client';

import { createContext, useContext, ReactNode, useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { io as socketIO, Socket } from 'socket.io-client';
import { useInstance } from '@/contexts/InstanceContext';
import { HolonService } from '@/services/holonService';

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

    const sock = socketIO(SOCKET_URL, { transports: ['websocket'], upgrade: false });
    socketRef.current = sock;

    sock.on('connect', () => {
      sock.emit('join_user_room', { userId });
      setSocket(sock);
    });

    sock.on('holon_update', ({ balance, instanceId }: { balance: number; instanceId?: string }) => {
      // Only apply updates for the instance currently being viewed
      if (!instanceId || instanceId === instanceIdRef.current) setHolonBalance(balance);
    });

    return () => {
      sock.disconnect();
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
