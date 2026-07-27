'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import type { MyCommunity } from '@/hooks/useCommunity';

type Mode = 'join' | 'create';

// Task item 1, second half: once signed in, a member still needs an ACTIVE
// community — shown whenever useCommunity finishes its lookup (`checked`)
// and there's no active pick yet. Doubles as the community picker landing
// (the FEATURE task): when `communities` is non-empty it lists them as
// one-click links above the join/create forms, so returning members don't
// have to re-type a code just to get back into a community they're already
// in — `onSelect` is useCommunity's `selectCommunity`. Two lightweight forms
// share one "pick a handle" field, mirroring the login/signup screens'
// full-bleed layout so the app doesn't feel like it's dropped into a
// different design system mid-flow.
export default function CommunityGate({
  communities = [],
  onSelect,
  onCreate,
  onJoin,
  loading,
  error,
  clearError,
}: {
  communities?: MyCommunity[];
  onSelect?: (code: string) => void;
  onCreate: (name: string, handle: string) => Promise<unknown>;
  onJoin: (code: string, handle: string) => Promise<unknown>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}) {
  const [mode, setMode] = useState<Mode>('join');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [handle, setHandle] = useState('');
  const hasCommunities = communities.length > 0;

  async function submit() {
    clearError();
    if (!handle.trim()) return;
    if (mode === 'create') {
      if (!name.trim()) return;
      await onCreate(name.trim(), handle.trim()).catch(() => {});
    } else {
      if (!code.trim()) return;
      await onJoin(code.trim(), handle.trim()).catch(() => {});
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-[max(3rem,env(safe-area-inset-top))]">
      <header className="rise-in">
        <p className="eyebrow" style={{ color: 'var(--own)' }}>{hasCommunities ? 'Welcome back' : 'One more step'}</p>
        <h1 className="display mt-3 text-5xl leading-[0.95]">
          {hasCommunities ? (
            <>Your<br /><span style={{ color: 'var(--own)' }}>circles</span></>
          ) : (
            <>Find your<br /><span style={{ color: 'var(--own)' }}>circle</span></>
          )}
        </h1>
        <p className="mt-3 text-sm text-mist-soft">
          {hasCommunities
            ? 'Pick a community to open its map, or start/join another below.'
            : 'Unison is for a trusted group of up to 50. Join with a code, or start a new one.'}
        </p>
      </header>

      {hasCommunities && (
        <section className="rise-in mt-8 flex flex-col gap-2">
          {communities.map(c => (
            <button
              key={c.code}
              type="button"
              onClick={() => onSelect?.(c.code)}
              className="flex items-center justify-between rounded-2xl border border-line-strong px-4 py-3 text-left transition-colors hover:border-own"
              style={{ background: 'var(--dusk-raised)' }}
            >
              <span>
                <span className="block text-sm text-mist">{c.name}</span>
                <span className="eyebrow !text-mist-faint">as {c.membership.handle}</span>
              </span>
              <span className="eyebrow" style={{ color: 'var(--own)' }}>open →</span>
            </button>
          ))}
        </section>
      )}

      <section className="rise-in mt-8" style={{ animationDelay: '0.1s' }}>
        {hasCommunities && <p className="eyebrow mb-3" style={{ color: 'var(--mist-faint)' }}>Or start / join another</p>}
        <div className="mb-5 flex gap-2">
          <button
            type="button"
            onClick={() => { setMode('join'); clearError(); }}
            className="eyebrow flex-1 rounded-full border px-3 py-2.5"
            style={{
              borderColor: mode === 'join' ? 'var(--own)' : 'var(--line-strong)',
              color: mode === 'join' ? 'var(--own)' : 'var(--mist-faint)',
              background: mode === 'join' ? 'var(--own-soft)' : 'transparent',
            }}
          >
            Join a community
          </button>
          <button
            type="button"
            onClick={() => { setMode('create'); clearError(); }}
            className="eyebrow flex-1 rounded-full border px-3 py-2.5"
            style={{
              borderColor: mode === 'create' ? 'var(--own)' : 'var(--line-strong)',
              color: mode === 'create' ? 'var(--own)' : 'var(--mist-faint)',
              background: mode === 'create' ? 'var(--own-soft)' : 'transparent',
            }}
          >
            Start one
          </button>
        </div>

        {mode === 'create' ? (
          <>
            <label className="eyebrow mb-2 block">Community name</label>
            <TextField value={name} onChange={e => setName(e.target.value)} placeholder="The Study" />
          </>
        ) : (
          <>
            <label className="eyebrow mb-2 block">Join code</label>
            <TextField
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="DEMO"
              autoCapitalize="characters"
            />
          </>
        )}

        <label className="eyebrow mb-2 mt-4 block">Your handle</label>
        <TextField
          value={handle}
          onChange={e => setHandle(e.target.value)}
          placeholder="how you'll be known here"
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />

        <Button variant="own" className="mt-5" onClick={submit} disabled={loading}>
          {loading ? 'Working…' : mode === 'create' ? 'Create community' : 'Join community'}
        </Button>
        {error && <p className="mt-3 text-sm" style={{ color: 'var(--live)' }}>{error}</p>}
      </section>
    </main>
  );
}
