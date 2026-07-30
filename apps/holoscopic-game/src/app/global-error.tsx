'use client';

// Last resort: a throw in the root layout itself, which error.tsx cannot catch
// because the layout that would render it is the thing that failed. Must supply
// its own <html> and <body>.
//
// Inline styles only, and no imports beyond React — anything this file depends
// on could be the thing that broke.
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error('[fatal render error]', error.digest ?? '(no digest)', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
          background: '#F7F4EF',
          color: '#0F0D0B',
          fontFamily: 'Georgia, serif',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Holoscopic could not load</h1>
        <p style={{ maxWidth: '32rem', color: '#6B6560' }}>
          Reloading usually fixes this. If it does not, the reference below tells
          us where to look.
        </p>
        {error.digest && (
          <code style={{ fontSize: '0.75rem', color: '#6B6560' }}>{error.digest}</code>
        )}
        <a
          href="/"
          style={{
            padding: '0.5rem 1.25rem',
            background: '#C83B50',
            color: '#fff',
            borderRadius: '4px',
            textDecoration: 'none',
          }}
        >
          Reload
        </a>
      </body>
    </html>
  );
}
