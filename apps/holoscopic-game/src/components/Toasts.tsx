'use client';

import { useEffect, useState } from 'react';
import { mono } from '@/lib/ui';

type ToastKind = 'info' | 'success' | 'error';
type ToastMsg = { id: number; text: string; kind: ToastKind };

const listeners = new Set<(t: ToastMsg) => void>();
let nextId = 1;

/** Fire-and-forget notification; rendered by the <Toasts /> mounted on the page. */
export function toast(text: string, kind: ToastKind = 'info') {
  listeners.forEach(l => l({ id: nextId++, text, kind }));
}

const KIND_COLOR: Record<ToastKind, string> = {
  info: 'var(--node-pattern)',
  success: 'var(--accent-emerald)',
  error: 'var(--accent)',
};

export default function Toasts() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  useEffect(() => {
    const onToast = (t: ToastMsg) => {
      setToasts(prev => [...prev.slice(-3), t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4200);
    };
    listeners.add(onToast);
    return () => { listeners.delete(onToast); };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', bottom: '1.25rem', left: '50%', transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 1300,
      maxWidth: 'min(420px, calc(100vw - 2rem))', pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} role="status" style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
          borderLeft: `3px solid ${KIND_COLOR[t.kind]}`,
          borderRadius: 8, padding: '0.6rem 0.9rem',
          boxShadow: '0 4px 16px rgba(15,13,11,0.12)',
          fontSize: 'var(--text-sm)', fontFamily: mono, color: 'var(--text-primary)', lineHeight: 1.4,
        }}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
