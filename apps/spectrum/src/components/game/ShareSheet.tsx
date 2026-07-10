'use client';

import { useState } from 'react';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';

export default function ShareSheet({
  code,
  open,
  onClose,
}: {
  code: string;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/g/${code}` : '';

  async function share() {
    const payload = {
      title: 'On a Spectrum',
      text: `Help organize a collective mind. Join room ${code}:`,
      url,
    };
    if (navigator.share) {
      try { await navigator.share(payload); return; } catch { /* user dismissed */ }
    }
    await navigator.clipboard.writeText(`${payload.text} ${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <p className="eyebrow text-center">Room code</p>
      <p className="display mt-2 text-center text-7xl tracking-[0.12em]">{code}</p>
      <p className="mt-3 text-center text-sm text-ink-soft">
        Send the link — friends sign in and land straight in the room.
      </p>
      <Button className="mt-6" onClick={share}>
        {copied ? 'Link copied!' : 'Share invite'}
      </Button>
      <button onClick={onClose} className="mt-3 w-full py-2 text-center text-sm text-ink-soft underline">
        Done
      </button>
    </BottomSheet>
  );
}
