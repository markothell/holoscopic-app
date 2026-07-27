'use client';

import { useState } from 'react';
import OverlayShell from './OverlayShell';
import ResolveGrid, { type ResolvePoint } from '@/components/resolve/ResolveGrid';
import ResolveComposer from '@/components/resolve/ResolveComposer';
import ProvenanceBreadcrumb from '@/components/graph/ProvenanceBreadcrumb';
import Button from '@/components/ui/Button';
import type { UnisonNode, UnisonReply } from '@/lib/types';
import type { ResolveAxis, ResolvePosition } from '@/lib/resolveLogic';

// Post view (task item 2): a read-first full view of ONE thought — its full
// (unclipped) context plus its reply thread (D9's aggregate grid + comment
// list). Always driven by an explicit node id from the caller (map popup,
// feed item, or a borrowed node's provenance link) — never a blank dock
// destination (task item 1). Editing is a secondary action, shown only when
// the viewer owns this exact node (isMine) — a borrowed/other-author node
// is read + reply only. The response composer is wired to callbacks so the
// caller (MapGraph) owns the reply state and picks the real vs. mock path;
// `live` (M1) just drives the footnote/button copy below — MapGraph's
// onSubmitReply/onToggleUpvote already call the real respond()/upvoteReply()
// funnel when `live` is true, writing the reply Entry and dropping the
// borrowed node onto My Map (D2/D8).
export default function PostOverlay({
  node,
  axes,
  replies,
  isMine,
  viewerId,
  live,
  onClose,
  onEdit,
  onOpenSource,
  onToggleUpvote,
  onSubmitReply,
}: {
  node: UnisonNode;
  axes: ResolveAxis[];
  replies: UnisonReply[];
  isMine: boolean;
  viewerId: string;
  live: boolean;
  onClose: () => void;
  onEdit: () => void;
  onOpenSource: (sourceNodeId: string) => void;
  onToggleUpvote: (replyId: string) => void;
  onSubmitReply: (stance: ResolvePosition, context: string) => void;
}) {
  const [stance, setStance] = useState<ResolvePosition | null>(null);
  const [context, setContext] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);

  const points: ResolvePoint[] = replies
    .filter(r => r.position)
    .map(r => ({ key: r.id, position: r.position!, highlight: r.userId === viewerId }));

  const accent = node.origin === 'borrowed' ? 'var(--borrowed)' : 'var(--own)';

  function submitReply() {
    if (!stance) return;
    onSubmitReply(stance, context);
    setContext('');
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2200);
  }

  return (
    <OverlayShell title="A thought" eyebrow={`by ${node.ownerHandle}`} onClose={onClose}>
      {node.origin === 'borrowed' && node.sourceNodeId && (
        <div className="mb-4">
          <ProvenanceBreadcrumb
            handle={node.sourceOwnerHandle ?? 'someone'}
            onOpenReplyMap={() => onOpenSource(node.sourceNodeId!)}
          />
        </div>
      )}

      <p className="voice-serif mb-3 text-xl leading-snug text-mist">{node.content.thought}</p>
      {node.content.context ? (
        <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-mist-soft">{node.content.context}</p>
      ) : (
        <p className="mb-4 text-sm italic text-mist-faint">No context added yet.</p>
      )}

      {isMine && (
        <Button variant="ghost" className="mb-6" onClick={onEdit}>Edit this thought</Button>
      )}

      {axes.length > 0 ? (
        <>
          <p className="eyebrow mb-2" style={{ color: accent }}>
            Reply map · {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </p>
          <ResolveGrid axes={axes} points={points} compact />

          <div className="mt-5 space-y-2">
            {replies.length === 0 && <p className="text-sm italic text-mist-faint">No replies yet.</p>}
            {replies.map(r => (
              <div key={r.id} className="flex items-start gap-3 rounded-xl border border-line px-3 py-2.5">
                <button
                  onClick={() => onToggleUpvote(r.id)}
                  className="eyebrow shrink-0 rounded-full border border-line-strong px-2 py-1"
                  style={{ color: r.voterIds.includes(viewerId) ? 'var(--own)' : 'var(--mist-faint)' }}
                >
                  ▲ {r.voteCount}
                </button>
                <div className="min-w-0">
                  <p className="eyebrow !text-mist-soft">{r.username}</p>
                  <p className="text-sm text-mist">{r.text}</p>
                </div>
              </div>
            ))}
          </div>

          {!isMine && (
            <div className="mt-6 border-t border-line pt-5">
              <p className="eyebrow mb-2">Place your stance</p>
              <ResolveComposer axes={axes} value={stance} onChange={setStance} />
              <textarea
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="Say why, in your own words"
                rows={2}
                className="mt-3 w-full rounded-2xl border border-line-strong bg-dusk-raised px-4 py-3 text-sm text-mist placeholder:text-mist-faint focus:border-own focus:outline-none"
              />
              <Button className="mt-3" variant="own" disabled={!stance} onClick={submitReply}>
                {savedNotice ? (live ? 'Sent ✓' : 'Saved locally ✓') : 'Reply'}
              </Button>
              <p className="mt-2 text-center text-xs text-mist-faint">
                {live
                  ? 'Publishes your reply here and drops a borrowed copy on your own map.'
                  : 'Preview only — sign in and join a community to publish for real.'}
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm italic text-mist-faint">This thought has no spectrum for a reply map yet.</p>
      )}
    </OverlayShell>
  );
}
