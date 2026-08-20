'use client';

import { useEffect, useMemo, useState } from 'react';
import OverlayShell from './OverlayShell';
import { MOCK_FEED } from '@/lib/mock';
import type { SynNode } from '@/lib/types';
import { SynthesisService } from '@/services/synthesisService';
import { synthesisSocket } from '@/services/socket';

type Lens = 'recency' | 'topic' | 'author';
const LENSES: { key: Lens; label: string }[] = [
  { key: 'recency', label: 'Recent' },
  { key: 'topic', label: 'By topic' },
  { key: 'author', label: 'By author' },
];

// D10: recently published across the community, switchable between
// recency (flat, default), by-topic, and by-author lenses. Mock path sorts
// the mock feed client-side; real path (M1) reads GET /synthesis/feed —
// published SynNodes scoped to the community instance, each carrying
// ownerHandle + topicLabel — and stays live via node_created (a fresh
// publish jumps to the top, recency-first). Tapping an item opens it as a
// post (task item 1) — Feed is a launch point for PostOverlay, never Post
// itself.
export default function FeedOverlay({
  instanceId,
  userId,
  useMock,
  onClose,
  onOpenPost,
}: {
  instanceId: string;
  userId: string;
  useMock: boolean;
  onClose: () => void;
  onOpenPost: (nodeId: string) => void;
}) {
  const [lens, setLens] = useState<Lens>('recency');
  const [feed, setFeed] = useState<SynNode[]>(useMock ? MOCK_FEED : []);
  const [loading, setLoading] = useState(!useMock);

  useEffect(() => {
    if (useMock) { setFeed(MOCK_FEED); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    SynthesisService.feed(instanceId, userId)
      .then(({ feed: serverFeed }) => { if (!cancelled) setFeed(serverFeed); })
      .catch(err => console.debug('[synthesis] feed load failed', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [useMock, instanceId, userId]);

  // Live inserts: a fresh publish from anyone in the community lands here
  // immediately (recency lens shows it first), without a refetch.
  useEffect(() => {
    if (useMock) return;
    return synthesisSocket.on('node_created', payload => {
      const { node } = payload as { node: SynNode };
      if (node.instanceId !== instanceId) return;
      setFeed(prev => [node, ...prev.filter(n => n.id !== node.id)]);
    });
  }, [useMock, instanceId]);

  const items = useMemo(() => {
    const sorted = [...feed];
    if (lens === 'topic') sorted.sort((a, b) => (a.topicLabel || 'zzz').localeCompare(b.topicLabel || 'zzz'));
    if (lens === 'author') sorted.sort((a, b) => a.ownerHandle.localeCompare(b.ownerHandle));
    return sorted;
  }, [feed, lens]);

  return (
    <OverlayShell title="What's published" eyebrow="Community feed" onClose={onClose}>
      <div className="mb-4 flex gap-2">
        {LENSES.map(l => (
          <button
            key={l.key}
            onClick={() => setLens(l.key)}
            className="eyebrow rounded-full border px-3 py-2"
            style={{
              borderColor: lens === l.key ? 'var(--own)' : 'var(--line-strong)',
              color: lens === l.key ? 'var(--own)' : 'var(--mist-faint)',
              background: lens === l.key ? 'var(--own-soft)' : 'transparent',
            }}
          >
            {l.label}
          </button>
        ))}
      </div>

      {loading && items.length === 0 && <p className="text-sm italic text-mist-faint">Loading…</p>}
      {!loading && items.length === 0 && <p className="text-sm italic text-mist-faint">Nothing published yet.</p>}

      <div className="space-y-3">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpenPost(item.id)}
            className="w-full rounded-2xl border border-line px-4 py-3.5 text-left transition-colors active:bg-dusk-soft"
            style={{ background: 'var(--dusk-raised)' }}
          >
            <p className="eyebrow mb-1.5" style={{ color: 'var(--own)' }}>{item.ownerHandle}{item.topicLabel ? ` · ${item.topicLabel}` : ''}</p>
            <p className="voice-serif text-base leading-snug text-mist">{item.content.thought}</p>
          </button>
        ))}
      </div>
    </OverlayShell>
  );
}
