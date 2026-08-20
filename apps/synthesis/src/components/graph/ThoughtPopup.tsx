'use client';

import { useState } from 'react';
import type { SynNode } from '@/lib/types';
import Button from '@/components/ui/Button';
import ProvenanceBreadcrumb from './ProvenanceBreadcrumb';

// The interView-style popup (MAP-8): context is never a third shape, it's
// revealed here on click, clipped if long with a click-through to the full
// panel. Kept intentionally small — a thought's context is a companion
// note, not the map's focal object. "Open thought" (task item 2) opens the
// read-first full post view (PostOverlay), not the edit sheet — editing
// moved inside that view as a secondary, own-nodes-only action.
//
// The MAP gestures live here too. Tapping a thought is how you reach a
// thought, and growing or re-filing *from* one is a map move, not a reading
// move — so none of it can sit four screens deep behind Open thought → Edit →
// Add child. Move was doing exactly that until 2026-08-20 (MO: "I can't
// relocate thoughts"), reachable only through the post view's Edit action,
// which is a reading surface. Topic hubs get the same set straight off their
// sheet (NodeSheet).
export default function ThoughtPopup({
  node,
  onClose,
  onOpenActions,
  onOpenSource,
  onAddChild,
  onStartMarry,
  onStartMove,
}: {
  node: SynNode;
  onClose: () => void;
  onOpenActions: () => void;
  onOpenSource: (sourceNodeId: string) => void;
  onAddChild: () => void;
  onStartMarry: () => void;
  /** Arms move mode — the map's next tap picks the new parent (D19). */
  onStartMove: () => void;
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
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="ghost" onClick={onOpenActions}>Open thought</Button>
          <div className="flex gap-2">
            <Button variant="own" className="!px-4 !py-3 !text-sm" onClick={onAddChild}>+ Add below</Button>
            <Button variant="join" className="!px-4 !py-3 !text-sm" onClick={onStartMarry}>◆ Marry</Button>
          </div>
          {/* The home hub is the map's fixed centre and moves nowhere (D19);
              a borrowed node is someone else's thought sitting on your map,
              and re-filing it is yours to do like anything else here. */}
          {!node.isHome && (
            <Button variant="ghost" className="!px-4 !py-3 !text-sm" onClick={onStartMove}>
              Move — file it elsewhere
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
