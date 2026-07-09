'use client';

import { useEffect, useState } from 'react';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';
import TextField from '@/components/ui/TextField';

// Click a structure line → edit its text.
export default function LineSheet({
  line,
  onSave,
  onClose,
}: {
  line: { id: string; role: string; text: string } | null;
  onSave: (id: string, text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(line?.text ?? '');

  useEffect(() => { setText(line?.text ?? ''); }, [line?.id, line?.text]);

  if (!line) return null;

  function save() {
    const trimmed = text.trim();
    if (!trimmed || !line) return;
    onSave(line.id, trimmed.slice(0, 80));
    onClose();
  }

  return (
    <BottomSheet open onClose={onClose}>
      <p className="eyebrow">{line.role}</p>
      <h2 className="display mt-1 text-3xl">Rewrite this line</h2>
      <TextField
        className="mt-4"
        value={text}
        maxLength={80}
        autoFocus
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); }}
      />
      <Button className="mt-3" onClick={save} disabled={!text.trim()}>
        Save line
      </Button>
    </BottomSheet>
  );
}
