'use client';

// Route-segment error boundary. There was none anywhere in any app, so a
// render-time throw fell through to Next's default: a blank screen with no way
// back and nothing logged where anyone would see it.
//
// Deliberately keeps the rest of the shell alive — only the failed segment is
// replaced, so navigation still works.
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is what ties this to the server-side log line for the same
    // failure, so quote it when reporting.
    console.error('[render error]', error.digest ?? '(no digest)', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h2 style={{ fontSize: '1.25rem', color: 'var(--ink, #0F0D0B)' }}>
        This part of the page did not load
      </h2>
      <p style={{ maxWidth: '32rem', color: 'var(--ink-muted, #6B6560)' }}>
        Something went wrong on our side. Trying again often works; if it keeps
        happening, the reference below helps us find it.
      </p>
      {error.digest && (
        <code style={{ fontSize: '0.75rem', color: 'var(--ink-muted, #6B6560)' }}>
          {error.digest}
        </code>
      )}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={reset}
          style={{
            padding: '0.5rem 1.25rem',
            background: 'var(--accent, #C83B50)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            padding: '0.5rem 1.25rem',
            border: '1px solid var(--border, #D9D4CC)',
            borderRadius: '4px',
            color: 'var(--ink, #0F0D0B)',
            textDecoration: 'none',
          }}
        >
          Go home
        </a>
      </div>
    </div>
  );
}
