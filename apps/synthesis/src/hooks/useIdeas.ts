'use client';

import { useCallback, useEffect, useState } from 'react';
import { SynthesisService } from '@/services/synthesisService';
import type { Idea, Membership, MyIdea } from '@/lib/types';

// The account's ideas — what it drafted and what it joined — plus which one is
// ACTIVE. An idea is its own child Instance (PLAN §8), and that instance id is
// what every following /nodes*/frames*/union call sends as x-instance-id
// (services/api.ts), so nothing below the picker means anything until one is
// chosen.
//
// Selection is always an explicit act (selectIdea, or the draft/join calls) —
// this hook deliberately does NOT auto-pick, even a remembered last code, so a
// signed-in account lands on its ideas list rather than being dropped onto
// whichever map was open last. `rememberCode`/`lastCode` back the localStorage
// key purely so the list can pre-highlight the most recent one.
//
// Never throws into the render tree: a failed lookup just leaves `ideas` empty
// and the caller falls back to the draft/join forms, so the app still renders.
const STORAGE_KEY = 'syn:lastIdeaCode';

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

export function useIdeas(userId: string | null) {
  const [ideas, setIdeas] = useState<MyIdea[]>([]);
  const [idea, setIdea] = useState<Idea | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false); // has the initial lookup settled?
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setIdeas([]);
      setIdea(null);
      setMembership(null);
      setChecked(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setChecked(false);
    SynthesisService.myIdeas(userId)
      .then(({ ideas: list }) => {
        if (!cancelled) setIdeas(list);
      })
      .catch(err => {
        if (!cancelled) console.debug('[synthesis] idea lookup failed', err);
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

  // Makes one of `ideas` the active idea. Purely local — the list already
  // carries everything a membership does — and persists the code so the list
  // can pre-highlight it next time.
  const selectIdea = useCallback((code: string) => {
    const picked = ideas.find(i => i.code === code);
    if (!picked) return;
    const { membership: m, ...rest } = picked;
    setIdea(rest);
    setMembership(m);
    rememberCode(rest.code);
  }, [ideas]);

  // The "← ideas" affordance: back to the list, without forgetting which
  // ideas exist or touching the remembered code.
  const leaveActive = useCallback(() => {
    setIdea(null);
    setMembership(null);
  }, []);

  const lastCode = readLastCode();

  // draft/join payloads omit collaboratorCount — only the /ideas/:code lookup
  // carries it. Backfill whenever it's missing so the header shows the true
  // count (1 on draft, N once others join).
  useEffect(() => {
    const code = idea?.code;
    if (!userId || !code || idea?.collaboratorCount != null) return;
    let cancelled = false;
    SynthesisService.getIdea(code, userId)
      .then(({ idea: full }) => {
        if (cancelled || full?.collaboratorCount == null) return;
        setIdea(prev => (prev && prev.code === code
          ? { ...prev, collaboratorCount: full.collaboratorCount }
          : prev));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [idea?.code, idea?.collaboratorCount, userId]);

  // A freshly drafted/joined idea has no stats yet; seed the row the list
  // renders so it appears immediately rather than after a refetch.
  const addToList = useCallback((i: Idea, m: Membership, draftedByMe: boolean) => {
    setIdeas(prev => [
      {
        ...i,
        membership: m,
        collaboratorCount: i.collaboratorCount ?? 1,
        draftedByMe,
        lastActivityAt: i.createdAt,
      },
      ...prev.filter(existing => existing.code !== i.code),
    ]);
  }, []);

  const draft = useCallback(async (
    title: string,
    visibility: 'public' | 'private' = 'private',
  ) => {
    if (!userId) throw new Error('Sign in required');
    setLoading(true);
    setError(null);
    try {
      const { idea: i, membership: m } = await SynthesisService.createIdea(
        { title, visibility }, userId,
      );
      setIdea(i);
      setMembership(m);
      addToList(i, m, true);
      rememberCode(i.code);
      return i;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not draft that idea');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [userId, addToList]);

  const join = useCallback(async (code: string) => {
    if (!userId) throw new Error('Sign in required');
    setLoading(true);
    setError(null);
    try {
      const { idea: i, membership: m } = await SynthesisService.joinIdea(
        code.trim().toUpperCase(), userId,
      );
      setIdea(i);
      setMembership(m);
      addToList(i, m, m.role === 'admin');
      rememberCode(i.code);
      return i;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that idea');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [userId, addToList]);

  return {
    ideas,
    idea,
    membership,
    lastCode,
    loading,
    checked,
    error,
    clearError: () => setError(null),
    selectIdea,
    leaveActive,
    draft,
    join,
  };
}
