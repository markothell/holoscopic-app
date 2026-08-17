'use client';

import { useEffect, useState } from 'react';
import type { NodeContent, SynFrame, SynNode } from '@/lib/types';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import { TextField, TextArea } from '@/components/ui/TextField';
import AxisPicker from './AxisPicker';
import ProvenanceBreadcrumb from '@/components/graph/ProvenanceBreadcrumb';

// The action sheet for an existing node: edit its content, set its axes
// (thought only), publish/unpublish, add a child, or arm marry mode on it.
// Topics and thoughts share this shell but show kind-appropriate fields.
// Reached directly for topic hubs (they have no post view) and, for
// thoughts, only as the "Edit" secondary action inside PostOverlay
// (task item 2) — never straight off the map anymore.
export default function NodeSheet({
  node,
  open,
  frames,
  parentNodes,
  onClose,
  onEdit,
  onSetAxes,
  onCoinFrame,
  onPublishToggle,
  onAddChild,
  onStartMarry,
  onStartMove,
  onUnmarry,
  onOpenSource,
}: {
  node: SynNode | null;
  open: boolean;
  frames: SynFrame[];
  /** The node's parents, resolved — what the unmarry choice names (D19). */
  parentNodes: SynNode[];
  onClose: () => void;
  onEdit: (content: Partial<NodeContent>) => void;
  onSetAxes: (ids: string[]) => void;
  onCoinFrame: (poleA: string, poleB: string) => Promise<string> | string;
  onPublishToggle: () => void;
  onAddChild: () => void;
  onStartMarry: () => void;
  /** D19: arm move mode — the map's next tap picks the new parent. */
  onStartMove: () => void;
  /** D19: drop the other parent of a join node; keep this one. */
  onUnmarry: (keepParentId: string) => void;
  onOpenSource?: (sourceNodeId: string) => void;
}) {
  const [topic, setTopic] = useState('');
  const [thought, setThought] = useState('');
  const [context, setContext] = useState('');

  useEffect(() => {
    if (!node) return;
    setTopic(node.content.topic);
    setThought(node.content.thought);
    setContext(node.content.context);
  }, [node]);

  if (!node) return null;
  const accent = node.origin === 'borrowed' ? 'var(--borrowed)' : 'var(--own)';
  const isTopic = node.kind === 'topic';

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="pb-2">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <span className="eyebrow" style={{ color: accent }}>
              {isTopic ? 'Topic hub' : 'Thought'}
              {node.origin !== 'borrowed' && ` · ${node.ownerHandle}`}
            </span>
            {node.sourceNodeId && (
              <ProvenanceBreadcrumb
                handle={node.sourceOwnerHandle ?? 'someone'}
                onOpenReplyMap={() => onOpenSource?.(node.sourceNodeId!)}
                promoted={node.origin === 'own'}
                compact
              />
            )}
            {node.origin === 'borrowed' && node.sourceNodeId && (
              /* M2: the promote hint — editing thought/context below is the
                 single "make it mine" gesture (no separate adopt step);
                 origin flips borrowed -> own on save, provenance stays. */
              <p className="mt-1 text-[0.65rem] italic" style={{ color: 'var(--mist-faint)' }}>
                Add your own thought or context below to make this yours.
              </p>
            )}
          </div>
          {node.edgeKind === 'marriage' && <span className="eyebrow shrink-0" style={{ color: 'var(--join)' }}>◆ join</span>}
        </div>

        {isTopic ? (
          <TextField
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onBlur={() => topic.trim() && topic !== node.content.topic && onEdit({ topic: topic.trim() })}
            placeholder="Hub label"
            className="mb-3"
          />
        ) : (
          <>
            <TextArea
              value={thought}
              onChange={e => setThought(e.target.value)}
              onBlur={() => thought.trim() && thought !== node.content.thought && onEdit({ thought: thought.trim() })}
              placeholder="Your one-sentence claim"
              rows={2}
              maxLength={280}
              className="voice-serif mb-3 !text-base"
            />
            <TextArea
              value={context}
              onChange={e => setContext(e.target.value)}
              onBlur={() => context !== node.content.context && onEdit({ context })}
              placeholder="Context — the prose behind the claim, links welcome"
              rows={4}
              className="mb-4 !text-sm"
            />
            <AxisPicker
              frames={frames}
              selected={node.axisFrameIds}
              onChange={onSetAxes}
              onCoin={async (a, b) => {
                const id = await onCoinFrame(a, b);
                onSetAxes([...node.axisFrameIds, id].slice(0, 2));
              }}
            />
          </>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <Button variant={node.visibility === 'published' ? 'ghost' : 'live'} onClick={onPublishToggle}>
            {node.visibility === 'published' ? 'Unpublish' : 'Publish'}
          </Button>
          <div className="flex gap-2">
            {/* One gesture, either kind: the create sheet asks for a
                subtopic hub or a thought (PLAN §2 — unlimited depth). */}
            <Button variant="own" onClick={onAddChild}>+ Add below</Button>
            <Button variant="join" onClick={onStartMarry}>Marry from here</Button>
          </div>

          {/* D19: the two correction gestures. Move re-files this node —
              the next map tap picks its new parent. Unmarry names the two
              parents and keeps the chosen one; the arity flip back to an
              ordinary child happens server-side (utils/synNodes.js#reparent).
              The home hub is the map's fixed centre and moves nowhere. */}
          {!node.isHome && (
            node.edgeKind === 'marriage' && parentNodes.length === 2 ? (
              <div>
                <p className="eyebrow mb-1.5 !text-[0.6rem]" style={{ color: 'var(--mist-faint)' }}>
                  Unmarry — keep it under one parent
                </p>
                <div className="flex gap-2">
                  {parentNodes.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onUnmarry(p.id)}
                      className="flex-1 rounded-xl border px-3 py-2.5 text-left text-xs leading-snug"
                      style={{ borderColor: 'var(--line-strong)', color: 'var(--mist-soft)' }}
                    >
                      keep under &ldquo;{(p.kind === 'topic' ? p.content.topic : p.content.thought).slice(0, 26)}&rdquo;
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <Button variant="ghost" onClick={onStartMove}>Move — file it elsewhere</Button>
            )
          )}
        </div>
      </div>
    </Sheet>
  );
}
