'use client';

import { useState } from 'react';
import type { UnisonNode } from '@/lib/types';
import Button from '@/components/ui/Button';
import ProvenanceBreadcrumb from './ProvenanceBreadcrumb';

// The interView-style popup (MAP-8): context is never a third shape, it's
// revealed here on click, clipped if long with a click-through to the full
// panel. Kept intentionally small — a thought's context is a companion
// note, not the map's focal object. "Open thought" (task item 2) now opens
// the read-first full post view (PostOverlay), not the edit sheet — editing
// moved inside that view as a secondary, own-nodes-only action.
export default function ThoughtPopup({
  node,
  onClose,
  onOpenActions,
  onOpenSource,
}: {
  node: UnisonNode;
  onClose: () => void;
  onOpenActions: () => void;
  onOpenSource: (sourceNodeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const context = node.content.context;
  const isLong = context.length > 220;
  const shown = expanded || !isLong ? context : context.slice(0, 220) + '…';
  const accent = node.origin === 'borrowed' ? 'var(--borrowed)' : 'var(--own)';

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        className="tone-in absolute left-1/2 top-1/2 w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5"
        style={{ background: 'var(--dusk-raised)', borderColor: accent, boxShadow: 'var(--shadow-card)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          {node.sourceNodeId ? (
            <ProvenanceBreadcrumb
              handle={node.sourceOwnerHandle ?? 'someone'}
              onOpenReplyMap={() => onOpenSource(node.sourceNodeId!)}
              promoted={node.origin === 'own'}
              compact
            />
          ) : (
            <span className="eyebrow" style={{ color: accent }}>{node.ownerHandle}</span>
          )}
          <button aria-label="Close" onClick={onClose} className="shrink-0 text-mist-faint">✕</button>
        </div>
        <p className="voice-serif mb-3 text-lg leading-snug text-mist">{node.content.thought}</p>
        {context ? (
          <p className="text-sm leading-relaxed text-mist-soft">
            {shown}
            {isLong && !expanded && (
              <button onClick={() => setExpanded(true)} className="ml-1 underline" style={{ color: accent }}>
                Read more
              </button>
            )}
          </p>
        ) : (
          <p className="text-sm italic text-mist-faint">No context added yet.</p>
        )}
        <Button variant="ghost" className="mt-4" onClick={onOpenActions}>Open thought</Button>
      </div>
    </div>
  );
}
