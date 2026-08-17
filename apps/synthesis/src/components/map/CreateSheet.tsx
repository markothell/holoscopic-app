'use client';

import { useEffect, useState } from 'react';
import type { NodeContent, NodeKind, SynFrame } from '@/lib/types';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import { TextField, TextArea } from '@/components/ui/TextField';
import AxisPicker from './AxisPicker';

export type CreateIntent =
  | { type: 'root' }                                                        // top-level FAB
  | { type: 'child'; parentId: string; parentLabel: string; parentKind: NodeKind }
  | { type: 'marry'; parentLabel: string; kind: NodeKind };                 // completing a marriage

// One create flow for root / child / marriage-completion. Kind is a free
// choice everywhere you're authoring a new node — root *and* child — because
// the map grows recursively (PLAN §2: "unlimited depth, unlimited fan-out",
// the same branching OaS gives subtopics). A hub can hold sub-hubs, and a
// thought can carry its own hub or further thoughts beneath it; the funnel
// (`utils/synNodes.js#createChild`) has always accepted either kind, this
// sheet was the only thing pinning a child to `thought`. Only a marriage's
// kind is fixed — to whatever the two selected parents share (D4).
export default function CreateSheet({
  open,
  intent,
  frames,
  onCancel,
  onSubmit,
  onCoinFrame,
}: {
  open: boolean;
  intent: CreateIntent | null;
  frames: SynFrame[];
  onCancel: () => void;
  onSubmit: (kind: NodeKind, content: Partial<NodeContent>, axisFrameIds: string[]) => void;
  onCoinFrame: (poleA: string, poleB: string) => Promise<string> | string;
}) {
  const [kind, setKind] = useState<NodeKind>('thought');
  const [topic, setTopic] = useState('');
  const [thought, setThought] = useState('');
  const [context, setContext] = useState('');
  const [axisFrameIds, setAxisFrameIds] = useState<string[]>([]);

  useEffect(() => {
    if (!intent) return;
    setTopic(''); setThought(''); setContext(''); setAxisFrameIds([]);
    setKind(intent.type === 'marry' ? intent.kind : intent.type === 'child' ? 'thought' : 'thought');
  }, [intent]);

  if (!intent) return null;

  const heading = intent.type === 'root'
    ? 'Start something new'
    : intent.type === 'child'
      ? `Under ${intent.parentLabel}`
      : `Marrying ${intent.parentLabel}`;

  const canSubmit = kind === 'topic' ? topic.trim().length > 0 : thought.trim().length > 0;
  // A hub under a hub is a subtopic; a hub under a thought opens a new
  // cluster off that claim. Same node, different job — so name it for where
  // the member is standing.
  const hubLabel = intent.type === 'child' && intent.parentKind === 'topic' ? 'Subtopic hub' : 'Topic hub';

  function submit() {
    if (!canSubmit) return;
    onSubmit(kind, { topic: topic.trim(), thought: thought.trim(), context }, axisFrameIds);
  }

  return (
    <Sheet open={open} onClose={onCancel}>
      <div className="pb-2">
        <p className="eyebrow mb-1" style={{ color: intent.type === 'marry' ? 'var(--join)' : 'var(--own)' }}>
          {intent.type === 'marry' ? 'New synthesis' : 'New node'}
        </p>
        <h2 className="display mb-4 text-2xl">{heading}</h2>

        {intent.type !== 'marry' && (
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setKind('topic')}
              className="flex-1 rounded-xl border px-3 py-3 text-sm"
              style={{ borderColor: kind === 'topic' ? 'var(--own)' : 'var(--line-strong)', color: kind === 'topic' ? 'var(--own)' : 'var(--mist-soft)' }}
            >
              {hubLabel}
            </button>
            <button
              type="button"
              onClick={() => setKind('thought')}
              className="flex-1 rounded-xl border px-3 py-3 text-sm"
              style={{ borderColor: kind === 'thought' ? 'var(--own)' : 'var(--line-strong)', color: kind === 'thought' ? 'var(--own)' : 'var(--mist-soft)' }}
            >
              Thought
            </button>
          </div>
        )}

        {kind === 'topic' ? (
          <TextField value={topic} onChange={e => setTopic(e.target.value)} placeholder="Hub label, e.g. Craft" maxLength={120} className="mb-3" />
        ) : (
          <>
            <TextArea
              value={thought}
              onChange={e => setThought(e.target.value)}
              placeholder="Your one-sentence claim"
              rows={2}
              maxLength={280}
              className="voice-serif mb-3 !text-base"
            />
            <TextArea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Context — optional, prose behind the claim"
              rows={3}
              className="mb-4 !text-sm"
            />
            <AxisPicker
              frames={frames}
              selected={axisFrameIds}
              onChange={setAxisFrameIds}
              onCoin={async (a, b) => {
                const id = await onCoinFrame(a, b);
                setAxisFrameIds(prev => [...prev, id].slice(0, 2));
              }}
            />
          </>
        )}

        <Button className="mt-5" disabled={!canSubmit} onClick={submit}>
          {intent.type === 'marry' ? 'Marry' : 'Create'}
        </Button>
      </div>
    </Sheet>
  );
}
