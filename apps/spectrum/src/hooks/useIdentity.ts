'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PlayerIdentity } from '@/lib/types';

// Device-remembered guest identity. One display name per device, one
// { playerId, token } per game code. No accounts anywhere.
const NAME_KEY = 'spectrum:name';
const gameKey = (code: string) => `spectrum:game:${code.toUpperCase()}`;

export function getStoredName(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(NAME_KEY) || '';
}

export function storeName(name: string) {
  localStorage.setItem(NAME_KEY, name);
}

export function getStoredIdentity(code: string): PlayerIdentity | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(gameKey(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlayerIdentity;
  } catch {
    return null;
  }
}

export function storeIdentity(code: string, identity: PlayerIdentity) {
  localStorage.setItem(gameKey(code), JSON.stringify(identity));
}

export function useIdentity(code: string) {
  const [identity, setIdentity] = useState<PlayerIdentity | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setIdentity(getStoredIdentity(code));
    setHydrated(true);
  }, [code]);

  const save = useCallback((next: PlayerIdentity) => {
    storeIdentity(code, next);
    storeName(next.name);
    setIdentity(next);
  }, [code]);

  return { identity, hydrated, save };
}
