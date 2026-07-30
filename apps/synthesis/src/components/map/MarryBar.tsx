'use client';

import type { SynNode } from '@/lib/types';

// The floating strip that appears in marry mode: tap one node, tap a
// second, then Marry (D4/MAP-2). No cross-kind marriage — the bar reflects
// that constraint back before the submit even fires.
export default function MarryBar({
  selected,
  onMarry,
  onCancel,
}: {
  selected: SynNode[];
  onMarry: () => void;
  onCancel: () => void;
}) {
  const label = (n: SynNode) => n.kind === 'topic' ? n.content.topic : n.content.thought;
  const ready = selected.length === 2 && selected[0].kind === selected[1].kind;

  let message = 'Tap a node to begin a marriage';
  if (selected.length === 1) message = `“${label(selected[0]).slice(0, 28)}” selected — tap a second ${selected[0].kind} to marry`;
  if (selected.length === 2 && !ready) message = 'Marriage needs two nodes of the same kind';

  return (
    <div className="tone-in fixed inset-x-0 bottom-24 z-30 mx-auto flex w-[calc(100%-2.5rem)] max-w-sm items-center justify-between gap-3 rounded-2xl border px-4 py-3"
      style={{ background: 'var(--dusk-raised)', borderColor: 'var(--join)', boxShadow: 'var(--shadow-card)' }}
    >
      <p className="flex-1 text-xs text-mist-soft">{message}</p>
      <div className="flex shrink-0 gap-2">
        <button onClick={onCancel} className="eyebrow rounded-full border border-line-strong px-3 py-1.5">Cancel</button>
        <button
          onClick={onMarry}
          disabled={!ready}
          className="eyebrow rounded-full px-3 py-1.5 disabled:opacity-30"
          style={{ background: 'var(--join)', color: 'var(--dusk-deep)' }}
        >
          Marry
        </button>
      </div>
    </div>
  );
}
