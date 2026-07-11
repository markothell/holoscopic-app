'use client';

import { useState } from 'react';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';
import TextField from '@/components/ui/TextField';
import { OasService } from '@/services/oasService';
import { ApiError } from '@/services/api';
import type { Game, Nomination } from '@/lib/types';

// Round 1: throw a subtopic into the web. Costs one token — it locks
// behind the nomination and comes home when the round settles. With a
// `parent` set, it branches off that subtopic instead of the game topic.
export default function SubtopicSheet({
  game,
  userId,
  open,
  parent,
  onClose,
}: {
  game: Game;
  userId: string;
  open: boolean;
  parent?: Nomination | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) { setError('Name the subtopic first'); return; }
    setBusy(true);
    setError(null);
    try {
      await OasService.nominateSubtopic(game.code, trimmed, userId, parent?.id ?? null);
      setTitle('');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError('Out of tokens — support something instead, or wait for returns.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not nominate');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <p className="eyebrow">Round 1 · costs 1 token</p>
      <h2 className="display mt-1 text-3xl">
        {parent ? 'Branch a subtopic' : 'Add a subtopic'}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        {parent
          ? <>A facet of <span className="text-ink">{parent.title}</span> worth mapping. {game.config.quorum} tokens confirm it.</>
          : <>A facet of {game.topic} worth mapping. {game.config.quorum} tokens confirm it.</>}
      </p>
      <TextField
        className="mt-4"
        value={title}
        maxLength={80}
        autoFocus
        placeholder="Discipline"
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
      />
      <Button className="mt-3" onClick={submit} disabled={busy}>
        {busy ? 'Nominating…' : 'Nominate · ● 1'}
      </Button>
      {error && <p className="mt-3 text-sm text-ax">{error}</p>}
    </BottomSheet>
  );
}
