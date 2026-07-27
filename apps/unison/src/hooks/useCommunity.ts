'use client';

import { useCallback, useEffect, useState } from 'react';
import { UnisonService } from '@/services/unisonService';
import type { Community, Membership } from '@/lib/types';

export type MyCommunity = Community & { membership: Membership };

// Community entry + identity (task item 1). A signed-in account still needs
// a joined community — its own child Instance (PLAN §8) — before any
// /nodes*/frames* call means anything; that instance id is what every
// following request sends as x-instance-id (services/api.ts). This hook
// loads the account's communities (GET /me/communities) on sign-in and
// exposes `selectCommunity` so the landing picker (page.tsx) can make the
// ACTIVE choice explicit — it deliberately does NOT auto-pick one, even a
// remembered last code, so a signed-in user always lands on the picker
// instead of being dropped straight onto whichever community was open last.
// `rememberCode`/readLastCode still back the localStorage key so the picker
// can pre-highlight the most recently used community as a convenience.
// Never throws into the render tree — a failed lookup just means
// `communities` stays empty, and callers (page.tsx) fall back to the picker's
// create/join form so the app still renders.
const STORAGE_KEY = 'unison:lastCommunityCode';

function readLastCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberCode(code: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // best-effort only
  }
}

export function useCommunity(userId: string | null) {
  const [communities, setCommunities] = useState<MyCommunity[]>([]);
  const [community, setCommunity] = useState<Community | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false); // has the initial lookup settled?
  const [error, setError] = useState<string | null>(null);

  // Loads the account's communities for the picker landing. Deliberately
  // never sets `community`/`membership` here — selection is always an
  // explicit act (selectCommunity, or the create/join calls below), so a
  // signed-in user lands on the picker, not straight onto a map.
  useEffect(() => {
    if (!userId) {
      setCommunities([]);
      setCommunity(null);
      setMembership(null);
      setChecked(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setChecked(false);
    UnisonService.myCommunities(userId)
      .then(({ communities: list }) => {
        if (!cancelled) setCommunities(list);
      })
      .catch(err => {
        if (!cancelled) console.debug('[unison] community lookup failed', err);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setChecked(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Makes a community from `communities` the active one — the picker's
  // click handler. Purely local (no network call, the list already has
  // everything a membership carries) and persists the code so the picker
  // can pre-highlight it next time.
  const selectCommunity = useCallback((code: string) => {
    const picked = communities.find(c => c.code === code);
    if (!picked) return;
    const { membership: m, ...c } = picked;
    setCommunity(c);
    setMembership(m);
    rememberCode(c.code);
  }, [communities]);

  // The "← communities" affordance — drops back to the picker without
  // forgetting which communities exist or touching the remembered code.
  const leaveActive = useCallback(() => {
    setCommunity(null);
    setMembership(null);
  }, []);

  const lastCode = readLastCode();

  // create/join/me-communities payloads omit memberCount — only the
  // /communities/:code lookup carries it. Backfill it whenever it's missing
  // so the header shows the true count (1 on create, N after others join)
  // instead of falling back to a seed number.
  useEffect(() => {
    const code = community?.code;
    if (!userId || !code || community?.memberCount != null) return;
    let cancelled = false;
    UnisonService.getCommunity(code, userId)
      .then(({ community: full }) => {
        if (cancelled || full?.memberCount == null) return;
        setCommunity(prev => (prev && prev.code === code ? { ...prev, memberCount: full.memberCount } : prev));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [community?.code, community?.memberCount, userId]);

  const create = useCallback(async (name: string, handle: string) => {
    if (!userId) throw new Error('Sign in required');
    setLoading(true);
    setError(null);
    try {
      const { community: c, membership: m } = await UnisonService.createCommunity({ name, handle }, userId);
      setCommunity(c);
      setMembership(m);
      setCommunities(prev => [{ ...c, membership: m }, ...prev]);
      rememberCode(c.code);
      return c;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create community');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const join = useCallback(async (code: string, handle: string) => {
    if (!userId) throw new Error('Sign in required');
    setLoading(true);
    setError(null);
    try {
      const { community: c, membership: m } = await UnisonService.joinCommunity(code.trim().toUpperCase(), handle, userId);
      setCommunity(c);
      setMembership(m);
      setCommunities(prev => [{ ...c, membership: m }, ...prev.filter(existing => existing.code !== c.code)]);
      rememberCode(c.code);
      return c;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join community');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return {
    communities,
    community,
    membership,
    lastCode,
    loading,
    checked,
    error,
    clearError: () => setError(null),
    selectCommunity,
    leaveActive,
    create,
    join,
  };
}
