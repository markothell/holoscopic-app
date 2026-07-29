'use client';

import { useState } from 'react';

// The provenance affordance on any node that came from someone else's
// thought — a borrowed node AND a promoted one (origin flips borrowed → own
// on promotion, but sourceNodeId/sourceOwnerHandle are retained, so the
// credit and links persist; PLAN §3 "provenance is retained"). Replaces the
// old plain-text "from {handle}" label everywhere it appeared (nodes.tsx
// card, ThoughtPopup, NodeSheet, PostOverlay). Two links: the source post's
// reply thread (fully wired — opens PostOverlay for sourceNodeId) and the
// source author's home graph (full cross-member map browsing is M1+; for now
// it resolves to an inline note). `promoted` styles it in the viewer's own
// accent and reads "built on X's" rather than the borrowed "from X".
export default function ProvenanceBreadcrumb({
  handle,
  onOpenReplyMap,
  compact = false,
  promoted = false,
}: {
  handle: string;
  onOpenReplyMap: () => void;
  compact?: boolean;
  promoted?: boolean;
}) {
  const [note, setNote] = useState(false);
  const size = compact ? '!text-[0.55rem]' : '';
  const accent = promoted ? 'var(--own)' : 'var(--borrowed)';

  return (
    <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${compact ? '' : 'mt-0.5'}`}>
      <span className={`eyebrow ${size}`} style={{ color: accent }}>
        {promoted ? `built on ${handle}’s` : `from ${handle}`}
      </span>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onOpenReplyMap(); }}
        className={`eyebrow ${size} underline decoration-dotted underline-offset-2`}
        style={{ color: accent }}
      >
        → reply map
      </button>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          setNote(true);
          setTimeout(() => setNote(false), 2000);
        }}
        className={`eyebrow ${size} underline decoration-dotted underline-offset-2`}
        style={{ color: accent }}
      >
        → {handle}&rsquo;s home graph
      </button>
      {note && (
        <span className="text-[0.6rem] italic text-mist-faint">
          full profile browsing is a later milestone
        </span>
      )}
    </div>
  );
}
