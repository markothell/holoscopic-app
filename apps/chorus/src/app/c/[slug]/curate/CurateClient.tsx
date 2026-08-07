'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMemorial } from '@/components/MemorialProvider';
import type { Memory } from '@/lib/types';

// The curator's page. Reached at /curate?k=<key> and nothing else — no account,
// no login, so the link can be texted to a family member (D10).
//
// A client component on purpose. The key is a secret that must not end up in a
// server log or a Next.js RSC payload cache, and the actions here are
// mutations against a page only one or two people will ever open. Server
// rendering would buy nothing and would put the key on the wire twice.
//
// Reported memories sort to the top. Flags NEVER auto-hide anything — on a
// memorial, coordinated flagging is a likelier failure than unmoderated
// content — so this queue is the only thing that acts on them.

type Filter = 'all' | 'reported' | 'hidden';

export default function CurateClient() {
  // Which memorial is being curated comes from the route, not the key — the
  // key authorizes, it does not identify.
  const { slug, api } = useMemorial();
  const base = `/c/${slug}`;
  const params = useSearchParams();
  const key = params.get('k') || '';

  const [memories, setMemories] = useState<Memory[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!key) { setState('denied'); return; }
    try {
      const page = await api.curate.wall(key);
      setMemories(page.memories);
      setState('ready');
    } catch (err) {
      // The API 404s an absent or wrong key rather than 403ing, so a bad key
      // and a missing memorial are indistinguishable from outside.
      setState(err instanceof Error && /not found/i.test(err.message) ? 'denied' : 'error');
    }
  }, [key, api]);

  useEffect(() => { void load(); }, [load]);

  async function setStatus(id: string, status: 'live' | 'hidden' | 'removed') {
    setBusy(id);
    try {
      await api.curate.setStatus(key, id, status);
      setMemories(list => list.map(m => (m.id === id ? { ...m, status } : m)));
    } catch {
      await load();   // fall back to server truth rather than guessing
    } finally {
      setBusy(null);
    }
  }

  if (state === 'loading') {
    return <Shell><p className="text-ink-faint">Loading…</p></Shell>;
  }

  if (state === 'denied') {
    return (
      <Shell>
        <p className="voice text-[1.25rem] text-ink">This link isn&apos;t valid.</p>
        <p className="mt-2 text-[0.9375rem] text-ink-soft">
          Curator links look like <code>/curate?k=…</code>. Check the one you were sent.
        </p>
      </Shell>
    );
  }

  if (state === 'error') {
    return (
      <Shell>
        <p className="voice text-[1.25rem] text-ink">Couldn&apos;t load the memories.</p>
        <button onClick={() => void load()} className="mt-3 text-[0.9375rem] text-dial underline underline-offset-4">
          Try again
        </button>
      </Shell>
    );
  }

  const reported = memories.filter(m => m.flagCount > 0 && m.status === 'live');
  const hidden = memories.filter(m => m.status !== 'live');
  const shown = filter === 'reported' ? reported : filter === 'hidden' ? hidden : memories;

  // Reported first, then newest — the queue is ordered by what needs a decision.
  const ordered = [...shown].sort((a, b) => (b.flagCount - a.flagCount));

  return (
    <Shell>
      <h1 className="voice text-[1.75rem] text-ink">Curating</h1>
      <p className="mt-1.5 text-[0.9375rem] text-ink-soft">
        {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
        {reported.length > 0 && ` · ${reported.length} reported`}
        {hidden.length > 0 && ` · ${hidden.length} hidden`}
      </p>

      <div className="mt-5 flex gap-1">
        {(['all', 'reported', 'hidden'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full px-3 py-1.5 text-[0.875rem] capitalize transition-colors
                        ${filter === f ? 'bg-dial text-card-raised' : 'bg-card text-ink-soft'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {ordered.length === 0 ? (
        <p className="voice mt-8 text-[1.0625rem] text-ink-soft">
          {filter === 'reported' ? 'Nothing has been reported.' : 'Nothing here.'}
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {ordered.map(memory => (
            <li
              key={memory.id}
              className={`rounded-[3px] px-4 py-4 shadow-[var(--shadow-card)]
                          ${memory.status === 'live' ? 'bg-card' : 'bg-nil-deep'}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`${base}/m/${memory.id}`} prefetch={false} className="voice text-[1.125rem] text-ink underline-offset-4 hover:underline">
                  {memory.title}
                </Link>
                {memory.flagCount > 0 && (
                  <span className="shrink-0 rounded-full bg-dial-soft px-2 py-0.5 text-[0.75rem] font-medium text-dial">
                    {memory.flagCount} reported
                  </span>
                )}
              </div>

              <p className="mt-1 text-[0.8125rem] text-ink-faint">
                {memory.anonymous ? 'Left anonymously' : memory.sharerName}
                {memory.status !== 'live' && ` · ${memory.status}`}
              </p>

              {memory.body.text && (
                <p className="voice mt-2 text-[0.9375rem] leading-[1.55] text-ink-soft">
                  {memory.body.text.slice(0, 240)}{memory.body.text.length > 240 ? '…' : ''}
                </p>
              )}
              {memory.body.audio && (
                <p className="mt-2 text-[0.8125rem] text-ink-faint">
                  Recording · {Math.round(memory.body.audio.durationMs / 1000)}s
                </p>
              )}

              <div className="mt-3 flex gap-2">
                {memory.status === 'live' ? (
                  <button
                    onClick={() => setStatus(memory.id, 'hidden')}
                    disabled={busy === memory.id}
                    className="rounded-[3px] border border-[var(--rule-strong)] px-3 py-1.5
                               text-[0.875rem] text-ink disabled:opacity-40"
                  >
                    Hide from the wall
                  </button>
                ) : (
                  <button
                    onClick={() => setStatus(memory.id, 'live')}
                    disabled={busy === memory.id}
                    className="rounded-[3px] bg-dial px-3 py-1.5 text-[0.875rem]
                               text-card-raised disabled:opacity-40"
                  >
                    Put it back
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Hiding is reversible and keeps the thread intact, which is why it's
          the only one-tap action. Permanent removal stays deliberate. */}
      <p className="mt-8 text-[0.8125rem] leading-relaxed text-ink-faint">
        Hiding takes a memory off the wall and out of the tag counts. It stays recoverable, and the
        thread it belongs to keeps its shape.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-md px-5 py-12">{children}</main>;
}
