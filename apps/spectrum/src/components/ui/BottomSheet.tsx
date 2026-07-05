'use client';

import { type ReactNode } from 'react';

// Modal bottom sheet — the app's one overlay pattern. Tap the scrim or the
// grab bar to dismiss.
export default function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="fade-in absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        className="sheet-up absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-paper-raised px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
        style={{ boxShadow: 'var(--shadow-sheet)' }}
      >
        <button
          aria-label="Close"
          onClick={onClose}
          className="mx-auto mb-4 block h-1.5 w-12 rounded-full bg-line-strong"
        />
        {children}
      </div>
    </div>
  );
}
