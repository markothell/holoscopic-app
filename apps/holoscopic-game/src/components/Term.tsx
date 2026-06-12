'use client';

import { useState, useRef, useEffect } from 'react';
import { mono } from '@/lib/ui';

/**
 * Glossary affordance: dotted-underline term with a tap/hover definition.
 * One vocabulary, defined once, usable in any copy.
 */

export const GLOSSARY: Record<string, string> = {
  holon: 'The game’s unit of contribution and influence. Earned by showing up and connecting — never bought.',
  stake: 'Holons escrowed when you join a map. You direct them by voting; whatever you don’t direct returns when the map settles.',
  frame: 'A reusable pair of named axes — the conceptual space a map lives in. Its creator earns each time someone maps with it.',
  topic: 'A question the group wants to explore. Nominated, then supported to quorum, then opened for maps.',
  pattern: 'A repeatable sequence of maps — a conversation structure others can run or fork.',
  quorum: 'The number of supporters a topic (or signups a session) needs before it goes live.',
  settle: 'When a map closes: voted stakes flow to comment authors, the rest returns to each staker.',
};

export default function Term({ k, children }: { k: keyof typeof GLOSSARY; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline' }}>
      <span
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{ borderBottom: '1px dotted var(--text-muted)', cursor: 'help' }}
      >
        {children}
      </span>
      {open && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          width: 230, zIndex: 300, display: 'block',
          background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
          borderRadius: 8, padding: '0.55rem 0.7rem', boxShadow: '0 6px 20px rgba(15,13,11,0.14)',
          fontSize: 'var(--text-xs)', fontFamily: mono, color: 'var(--text-secondary)',
          lineHeight: 1.5, textTransform: 'none', letterSpacing: 0, fontWeight: 400, textAlign: 'left',
        }}>
          {GLOSSARY[k]}
        </span>
      )}
    </span>
  );
}
