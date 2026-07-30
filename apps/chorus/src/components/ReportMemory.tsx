'use client';

import { useState } from 'react';
import { ensureContributor } from '@/services/api';
import { useMemorial } from '@/components/MemorialProvider';

// The way a visitor raises a concern about a memory.
//
// Deliberately quiet: a prominent Report button on a memorial invites use, and
// most of what people would flag here is grief rather than abuse. It sits at
// the foot of a memory, in the smallest type on the page.
//
// Reporting never hides anything. It moves the memory to the top of the
// curator's queue and nothing else — on a memorial, coordinated flagging is a
// likelier failure than unmoderated content. The confirmation says exactly
// that, so nobody expects the memory to disappear.

export default function ReportMemory({ memoryId }: { memoryId: string }) {
  const { api } = useMemorial();
  const [state, setState] = useState<'idle' | 'confirming' | 'sent'>('idle');

  async function send() {
    setState('sent');
    await ensureContributor(api);
    // The response is identical whatever the flag count, so a reporter learns
    // nothing about whether this memory is already queued.
    try { await api.flag(memoryId); } catch { /* stays 'sent' either way */ }
  }

  if (state === 'sent') {
    return (
      <p className="text-[0.8125rem] leading-relaxed text-ink-faint">
        Thank you — the person looking after this memorial will see it.
      </p>
    );
  }

  if (state === 'confirming') {
    return (
      <div className="text-[0.8125rem] leading-relaxed text-ink-faint">
        <p>This tells the person looking after this memorial. The memory stays on the wall.</p>
        <div className="mt-2 flex gap-3">
          <button onClick={send} className="text-dial underline underline-offset-4">
            Report it
          </button>
          <button onClick={() => setState('idle')} className="underline underline-offset-4">
            Never mind
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setState('confirming')}
      className="text-[0.8125rem] text-ink-faint underline decoration-rule
                 underline-offset-4 hover:text-ink"
    >
      Report this memory
    </button>
  );
}
