'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import TextField from '@/components/ui/TextField';
import BottomSheet from '@/components/ui/BottomSheet';
import { OasService } from '@/services/oasService';
import { useAuth } from '@/contexts/AuthContext';

const DEFAULT_THEMES = ['Experiences', 'Intentions', 'Actions'];

const ROUND_LENGTHS = [
  { label: '5 min', seconds: 300 },
  { label: '20 min', seconds: 1200 },
  { label: '1 hour', seconds: 3600 },
  { label: '1 day', seconds: 86400 },
];

export default function Home() {
  const router = useRouter();
  const { userId, userName, isAuthenticated, isLoading, logout } = useAuth();
  const [topic, setTopic] = useState('');
  const [themes, setThemes] = useState<string[]>([...DEFAULT_THEMES]);
  const [roundSeconds, setRoundSeconds] = useState(300);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  async function createGame() {
    if (!userId) return;
    const trimmed = topic.trim();
    if (!trimmed) { setError('Name the topic first'); return; }
    if (themes.some(t => !t.trim())) { setError('All three themes need names'); return; }
    setBusy(true);
    setError(null);
    try {
      const { game } = await OasService.create({
        topic: trimmed,
        themes: themes.map(t => t.trim()),
        config: {
          roundSeconds: {
            round1: roundSeconds, round2: roundSeconds, round3: roundSeconds,
            round4: roundSeconds, revise: roundSeconds,
          },
        },
      }, userId);
      router.push(`/g/${game.code}?new=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a game');
      setBusy(false);
    }
  }

  function joinByCode() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) { setError('That code looks too short'); return; }
    router.push(`/g/${c}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-[max(3rem,env(safe-area-inset-top))]">
      <header className="rise-in">
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">A game for revealing nuance</p>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            className="-mt-1 -mr-1 flex h-9 w-9 shrink-0 flex-col items-center justify-center gap-[5px] rounded-lg active:bg-paper-dim"
          >
            <span className="block h-0.5 w-5 rounded-full bg-ink" />
            <span className="block h-0.5 w-5 rounded-full bg-ink" />
            <span className="block h-0.5 w-5 rounded-full bg-ink" />
          </button>
        </div>
        <h1 className="display mt-3 text-[4.2rem] leading-[0.88]">
          On<br />a<br />
          <span className="text-ax">Spec</span><span className="text-ay">trum</span>
        </h1>
        <p className="mt-4 max-w-[28ch] text-base text-ink-soft">
          Brainstorm a web of subtopics, then map them together — one theme
          per round, tokens keep it honest.
        </p>
      </header>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        {isAuthenticated && (
          <p className="eyebrow">Playing as {userName}</p>
        )}
        <nav className="mt-2 flex flex-col">
          {isAuthenticated && (
            <Link
              href="/me"
              onClick={() => setMenuOpen(false)}
              className="display border-b border-line py-3 text-2xl"
            >
              My games
            </Link>
          )}
          <Link
            href="/games"
            onClick={() => setMenuOpen(false)}
            className="display border-b border-line py-3 text-2xl"
          >
            What&apos;s moving
          </Link>
          {isAuthenticated ? (
            <button
              onClick={() => { setMenuOpen(false); logout(); }}
              className="py-3 text-left text-sm text-ink-soft underline"
            >
              Sign out
            </button>
          ) : (
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="py-3 text-left text-sm text-ink-soft underline"
            >
              Sign in
            </Link>
          )}
        </nav>
      </BottomSheet>

      {isLoading ? null : !isAuthenticated ? (
        <section className="rise-in mt-auto pt-12" style={{ animationDelay: '0.1s' }}>
          <Link href="/login">
            <Button>Sign in to play</Button>
          </Link>
          <Link href="/signup">
            <Button variant="ghost" className="mt-3">Create an account</Button>
          </Link>

          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="eyebrow">Have a code?</span>
            <div className="h-px flex-1 bg-line" />
          </div>
          <div className="mt-3 flex gap-2">
            <TextField
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="ROOM"
              maxLength={5}
              autoComplete="off"
              autoCapitalize="characters"
              className="font-mono uppercase tracking-[0.3em]"
              onKeyDown={e => { if (e.key === 'Enter') joinByCode(); }}
            />
            <button
              onClick={joinByCode}
              className="display shrink-0 rounded-2xl border border-line-strong px-6 text-xl text-ink active:bg-paper-dim"
            >
              Join
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-ax">{error}</p>}
        </section>
      ) : (
        <section className="rise-in mt-10" style={{ animationDelay: '0.1s' }}>
          <label className="eyebrow mb-2 block">Topic</label>
          <TextField
            value={topic}
            maxLength={80}
            onChange={e => setTopic(e.target.value)}
            placeholder="Parenting"
            autoComplete="off"
          />

          <label className="eyebrow mb-2 mt-4 block">Three mapping themes</label>
          <div className="flex flex-col gap-2">
            {themes.map((t, i) => (
              <TextField
                key={i}
                value={t}
                maxLength={40}
                onChange={e => setThemes(prev => prev.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder={DEFAULT_THEMES[i]}
              />
            ))}
          </div>

          <label className="eyebrow mb-2 mt-4 block">Round length</label>
          <div className="flex gap-2">
            {ROUND_LENGTHS.map(r => (
              <button
                key={r.seconds}
                onClick={() => setRoundSeconds(r.seconds)}
                className={`display flex-1 rounded-2xl border px-2 py-3 text-lg transition-colors ${
                  roundSeconds === r.seconds
                    ? 'border-ink bg-ink text-paper'
                    : 'border-line-strong text-ink active:bg-paper-dim'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <Button className="mt-6" onClick={createGame} disabled={busy}>
            {busy ? 'Setting up…' : 'Start a game'}
          </Button>

          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="eyebrow">Have a code?</span>
            <div className="h-px flex-1 bg-line" />
          </div>
          <div className="mt-3 flex gap-2">
            <TextField
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="ROOM"
              maxLength={5}
              autoComplete="off"
              autoCapitalize="characters"
              className="font-mono uppercase tracking-[0.3em]"
              onKeyDown={e => { if (e.key === 'Enter') joinByCode(); }}
            />
            <button
              onClick={joinByCode}
              className="display shrink-0 rounded-2xl border border-line-strong px-6 text-xl text-ink active:bg-paper-dim"
            >
              Join
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-ax">{error}</p>}
        </section>
      )}

      <footer className="mt-12 border-t border-line pt-4">
        <p className="text-xs text-ink-faint">
          A{' '}
          <a href="https://holoscopic.io" className="underline" target="_blank" rel="noopener noreferrer">
            Holoscopic
          </a>{' '}
          game &middot;{' '}
          <a
            href="https://github.com/markothell/holoscopic-app"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            open source
          </a>{' '}
          &middot;{' '}
          <a
            href="https://markothell.substack.com"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Seeing Wholes
          </a>
        </p>
      </footer>
    </main>
  );
}
