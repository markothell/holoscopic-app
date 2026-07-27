'use client';

import { useState } from 'react';

// Task item 4: the provenance affordance on a borrowed node. Replaces the
// old plain-text "from {handle}" label everywhere it appeared (nodes.tsx
// card, ThoughtPopup, NodeSheet) with two links: the source post's reply
// thread (fully wired — opens PostOverlay for sourceNodeId, backed by the
// real GET /nodes/:id/post + live reply_upserted once M1's networking loop
// is connected, PLAN §3/§9) and the source author's home graph (PLAN item
// 3's home node is the eventual target; full cross-member map browsing —
// paging through *another* member's map, not just one post — is genuinely
// M1+, no route exists for it yet, so this resolves to an inline note
// rather than a real navigation — see PLAN.md).
export default function ProvenanceBreadcrumb({
  handle,
  onOpenReplyMap,
  compact = false,
}: {
  handle: string;
  onOpenReplyMap: () => void;
  compact?: boolean;
}) {
  const [note, setNote] = useState(false);
  const size = compact ? '!text-[0.55rem]' : '';

  return (
    <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${compact ? '' : 'mt-0.5'}`}>
      <span className={`eyebrow ${size} !text-borrowed`}>from {handle}</span>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onOpenReplyMap(); }}
        className={`eyebrow ${size} underline decoration-dotted underline-offset-2`}
        style={{ color: 'var(--borrowed)' }}
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
        style={{ color: 'var(--borrowed)' }}
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
