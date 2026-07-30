'use client';

import { useEffect, useState } from 'react';
import OverlayShell from '@/components/overlays/OverlayShell';
import { SynthesisService } from '@/services/synthesisService';
import type { Collaborator, SynNode } from '@/lib/types';

// Who is working on this idea — scoped to the idea, always. There is no
// global profile in Synthesis: a handle means something *here*, inside one
// thought space, and the same person in another idea is another handle.
//
// The roster is a door, not a directory. Two stats per person say what they
// have actually done — thoughts published, replies written — and tapping
// through opens their published thinking inside this idea, grouped the way
// their own map groups it. That is the "link to their local map" piece: you
// arrive at how someone is thinking, not at a profile card.
//
// PUBLISHED ONLY, and the filter is server-side (routes/synthesis.js). Drafts
// never leave their author's own map — the one privacy contract holds here
// exactly as it does on the feed.

function Stat({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <span className="eyebrow !text-[0.6rem]" style={{ color: n > 0 ? 'var(--mist-soft)' : 'var(--mist-faint)' }}>
      {n} {n === 1 ? one : many}
    </span>
  );
}

// One collaborator's published thinking, grouped by the topic hub it hangs
// under — which is the shape of their map, without standing up a second graph
// engine to say so.
function CollaboratorMap({
  code,
  collaborator,
  userId,
  onOpenPost,
  onBack,
}: {
  code: string;
  collaborator: Collaborator;
  userId: string;
  onOpenPost: (nodeId: string) => void;
  onBack: () => void;
}) {
  const [nodes, setNodes] = useState<SynNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    SynthesisService.collaboratorMap(code, collaborator.handle, userId)
      .then(({ nodes: list }) => { if (!cancelled) setNodes(list); })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load that map');
      });
    return () => { cancelled = true; };
  }, [code, collaborator.handle, userId]);

  const thoughts = (nodes ?? []).filter(n => n.kind === 'thought');
  const hubs = new Map((nodes ?? []).filter(n => n.kind === 'topic').map(h => [h.id, h]));

  // Hub label → its thoughts. Anything with no hub above it lands in one
  // trailing group rather than being dropped.
  const grouped = new Map<string, SynNode[]>();
  for (const t of thoughts) {
    const label = (t.topicId && hubs.get(t.topicId)?.content.topic) || 'On its own';
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label)!.push(t);
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <button
        type="button"
        onClick={onBack}
        className="eyebrow self-start !text-[0.6rem] underline"
        style={{ color: 'var(--mist-faint)' }}
      >
        ← everyone
      </button>

      <header>
        <p className="display text-2xl" style={{ color: 'var(--own)' }}>{collaborator.handle}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Stat n={collaborator.publishedCount} one="thought" many="thoughts" />
          <span className="eyebrow !text-[0.6rem]" style={{ color: 'var(--line-strong)' }}>·</span>
          <Stat n={collaborator.replyCount} one="reply" many="replies" />
        </div>
      </header>

      {error && <p className="text-sm" style={{ color: 'var(--live)' }}>{error}</p>}
      {!nodes && !error && <p className="eyebrow text-mist-faint">Loading…</p>}

      {nodes && thoughts.length === 0 && (
        <p className="text-sm text-mist-soft">
          {collaborator.handle} is still working privately. Published thoughts show up here.
        </p>
      )}

      {[...grouped.entries()].map(([label, items]) => (
        <section key={label}>
          <p className="eyebrow mb-2 !text-[0.6rem]" style={{ color: 'var(--mist-faint)' }}>{label}</p>
          <div className="flex flex-col gap-2">
            {items.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpenPost(t.id)}
                className="rounded-2xl border px-4 py-3 text-left transition-colors hover:border-own"
                style={{ borderColor: 'var(--line-strong)', background: 'var(--dusk-raised)' }}
              >
                <span className="voice-serif block text-sm leading-snug text-mist">
                  {t.content.thought}
                </span>
                <span className="eyebrow mt-1.5 block !text-[0.55rem]" style={{ color: 'var(--own)' }}>
                  open →
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function PeopleOverlay({
  code,
  userId,
  useMock,
  onClose,
  onOpenPost,
}: {
  code: string | null;
  userId: string;
  useMock: boolean;
  onClose: () => void;
  onOpenPost: (nodeId: string) => void;
}) {
  const [people, setPeople] = useState<Collaborator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Collaborator | null>(null);

  useEffect(() => {
    if (useMock || !code) return;
    let cancelled = false;
    SynthesisService.collaborators(code, userId)
      .then(({ collaborators }) => { if (!cancelled) setPeople(collaborators); })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the roster');
      });
    return () => { cancelled = true; };
  }, [code, userId, useMock]);

  return (
    <OverlayShell
      title={open ? 'Their thinking' : 'People'}
      eyebrow={open ? 'Published in this idea' : 'Working on this idea'}
      onClose={onClose}
    >
      {useMock || !code ? (
        <p className="text-sm text-mist-soft">People show up here once you are in a live idea.</p>
      ) : open ? (
        <CollaboratorMap
          code={code}
          collaborator={open}
          userId={userId}
          onOpenPost={onOpenPost}
          onBack={() => setOpen(null)}
        />
      ) : error ? (
        <p className="text-sm" style={{ color: 'var(--live)' }}>{error}</p>
      ) : !people ? (
        <p className="eyebrow text-mist-faint">Loading…</p>
      ) : (
        <div className="flex flex-col gap-2 pb-4">
          {people.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setOpen(p)}
              className="rounded-2xl border px-4 py-3.5 text-left transition-colors hover:border-own"
              style={{ borderColor: 'var(--line-strong)', background: 'var(--dusk-raised)' }}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm text-mist">{p.handle}</span>
                {/* 'admin' is the drafter — the one who started this idea. */}
                {p.role === 'admin' && (
                  <span className="eyebrow shrink-0 !text-[0.55rem]" style={{ color: 'var(--own)' }}>
                    drafted it
                  </span>
                )}
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <Stat n={p.publishedCount} one="thought" many="thoughts" />
                <span className="eyebrow !text-[0.6rem]" style={{ color: 'var(--line-strong)' }}>·</span>
                <Stat n={p.replyCount} one="reply" many="replies" />
              </span>
            </button>
          ))}
        </div>
      )}
    </OverlayShell>
  );
}
