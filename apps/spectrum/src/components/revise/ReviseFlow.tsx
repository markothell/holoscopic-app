'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import DragList, { type DragItem } from '@/components/rank/DragList';
import LineSheet from '@/components/revise/LineSheet';
import { OasService } from '@/services/oasService';
import type { Game } from '@/lib/types';

// The self-improving loop: the game's own structure as four lines —
// position decides the role (line 1 = topic, lines 2–4 = the round
// themes). Drag to rearrange, tap to rewrite, submit as a proposed
// variation. The same ranking language players just used on items, turned
// back on the game itself.

interface Line {
  id: string;
  text: string;
}

export default function ReviseFlow({
  game,
  userId,
}: {
  game: Game;
  userId: string;
}) {
  const [lines, setLines] = useState<Line[]>([
    { id: 'line-0', text: game.topic },
    { id: 'line-1', text: game.themes[0] },
    { id: 'line-2', text: game.themes[1] },
    { id: 'line-3', text: game.themes[2] },
  ]);
  const [order, setOrder] = useState(['line-0', 'line-1', 'line-2', 'line-3']);
  const [editing, setEditing] = useState<{ id: string; role: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(lines.map(l => [l.id, l])), [lines]);
  const roleAt = (i: number) => (i === 0 ? 'Topic' : `Round ${i + 1}`);

  // DragList renders name only; prefix the role so the structure reads as
  // the four lines of the game.
  const members = useMemo(() => {
    const m = new Map<string, DragItem>();
    order.forEach((id, i) => {
      const line = byId.get(id)!;
      m.set(id, { id, name: `${roleAt(i)}: ${line.text}` });
    });
    return m;
  }, [order, byId]);

  const dirty =
    order.some((id, i) => id !== `line-${i}`) ||
    lines[0].text !== game.topic ||
    lines.slice(1).some((l, i) => l.text !== game.themes[i]);

  async function submit() {
    const arranged = order.map(id => byId.get(id)!.text);
    setBusy(true);
    setError(null);
    try {
      await OasService.submitProposal(game.code, arranged[0], arranged.slice(1), userId);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit');
    } finally {
      setBusy(false);
    }
  }

  const mine = game.proposals.filter(p => p.proposedBy === userId);

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-24">
      <p className="eyebrow mt-8">The game you just played</p>
      <p className="mt-2 text-base text-ink-soft">
        Drag the lines into a better order, tap one to rewrite it, and submit
        your version. The best structures become the next games.
      </p>

      <div className="mt-5">
        <DragList
          members={members}
          order={order}
          onReorder={setOrder}
          accent="var(--x-accent)"
          onStory={(item) => {
            const i = order.indexOf(item.id);
            const line = byId.get(item.id)!;
            setEditing({ id: item.id, role: roleAt(i), text: line.text });
          }}
          storiesFor={new Set()}
          actionLabels={['edit', 'edited ✓']}
        />
      </div>
      <p className="eyebrow mt-2 !text-ink-faint">drag to reorder · line 1 becomes the topic</p>

      <Button
        className="mt-6"
        onClick={submit}
        disabled={busy || submitted}
      >
        {submitted ? 'Submitted ✓ — submit another?' : busy ? 'Submitting…' : dirty ? 'Submit my version' : 'Submit unchanged'}
      </Button>
      {submitted && (
        <Button variant="ghost" className="mt-3" onClick={() => setSubmitted(false)}>
          Edit and submit another
        </Button>
      )}
      {error && <p className="mt-3 text-sm text-ax">{error}</p>}

      {game.proposals.length > 0 && (
        <section className="mt-10">
          <p className="eyebrow">Proposed so far</p>
          <ul className="mt-2 space-y-1.5">
            {game.proposals.map(p => (
              <li key={p.id} className="rounded-xl bg-paper-raised px-3 py-2">
                <span className="display text-lg">{p.topic}</span>
                <span className="ml-2 text-sm text-ink-soft">{p.themes.join(' // ')}</span>
                <span className="eyebrow ml-2 !text-ink-faint">
                  {p.proposedBy === userId ? 'you' : p.proposedByName}
                </span>
              </li>
            ))}
          </ul>
          {mine.length > 0 && (
            <p className="mt-2 text-sm text-ink-soft">
              Yours is in — the invitation list opens when the clock runs out.
            </p>
          )}
        </section>
      )}

      <LineSheet
        line={editing}
        onSave={(id, text) => setLines(ls => ls.map(l => (l.id === id ? { ...l, text } : l)))}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
