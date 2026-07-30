'use client';

import { useEffect, useRef } from 'react';

// The one overlay pattern in Chorus. Compose, the tag drawer, and the share
// step are all this component at different heights — a memorial is used by
// people who are not confident with phones, so there is exactly one thing that
// slides up from the bottom and exactly one way to dismiss it.
//
// Sheets stack (the tag drawer opens over the compose sheet), so each takes
// its own `z` and only the topmost one handles Escape — otherwise one key
// press closes the whole stack and a half-written memory disappears.

let openSheets = 0;

interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  /** 'tall' fills the screen for composing; 'short' hugs its content. */
  height?: 'tall' | 'short';
  z?: number;
  children: React.ReactNode;
}

export default function Sheet({ open, onClose, label, height = 'tall', z = 40, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  // Callers pass `onClose` as an inline arrow, so its identity changes on
  // every render. Depending on it here would tear down and re-run the effect
  // on every keystroke — and since teardown restores focus to the trigger and
  // setup focuses the panel, the caret would be thrown out of whatever field
  // you were typing in after each character. Hold it in a ref and key the
  // effect on `open` alone, which is the only thing that should re-run it.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;

    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    openSheets += 1;
    const myDepth = openSheets;

    // Lock the page behind the sheet. Without this iOS scrolls the wall under
    // the compose sheet while you're typing into it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && myDepth === openSheets) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // Focus the panel itself rather than the first field: opening a sheet
    // should not pop the keyboard before you've seen what it's asking.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openSheets -= 1;
      if (openSheets === 0) document.body.style.overflow = previousOverflow;
      restoreFocusTo.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0" style={{ zIndex: z }}>
      <div
        className="absolute inset-0 bg-[rgba(35,38,31,0.34)] animate-[fade_200ms_ease-out]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`absolute inset-x-0 bottom-0 mx-auto flex max-w-md flex-col
                    rounded-t-[10px] bg-card shadow-[0_-8px_40px_rgba(35,38,31,0.18)]
                    outline-none animate-[rise_260ms_cubic-bezier(0.16,0.84,0.44,1)]
                    ${height === 'tall' ? 'h-[92dvh]' : 'max-h-[80dvh]'}`}
      >
        {/* The grab handle is decoration that does one real job: it says
            "this pulls down", which is how people expect to dismiss a sheet. */}
        <div className="flex justify-center pt-3 pb-1" aria-hidden>
          <div className="h-1 w-9 rounded-full bg-[var(--rule-strong)]" />
        </div>
        {children}
      </div>
    </div>
  );
}
