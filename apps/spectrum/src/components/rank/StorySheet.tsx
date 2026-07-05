'use client';

import { useEffect, useState } from 'react';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';
import type { RosterMember } from '@/lib/types';

// "Add a story" — the optional memory behind a placement.
export default function StorySheet({
  subject,
  axisLabel,
  initialText,
  onSave,
  onClose,
}: {
  subject: RosterMember | null;
  axisLabel: string;
  initialText: string;
  onSave: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setText(initialText); }, [initialText, subject?.id]);

  if (!subject) return null;

  async function save() {
    setBusy(true);
    try {
      await onSave(text.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={!!subject} onClose={onClose}>
      <p className="eyebrow">{axisLabel}</p>
      <h2 className="display mt-1 text-3xl">A story about {subject.name}</h2>
      <p className="story-serif mt-1 text-lg italic text-ink-soft">
        The memory behind your placement — they’ll see it at the reveal.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        maxLength={500}
        rows={4}
        autoFocus
        placeholder="That time at the lake house…"
        className="story-serif mt-4 w-full rounded-2xl border border-line-strong bg-paper px-4 py-3 text-lg focus:border-ink focus:outline-none"
      />
      <Button className="mt-3" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save story'}
      </Button>
    </BottomSheet>
  );
}
