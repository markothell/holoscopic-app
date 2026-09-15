'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Route-segment error boundary, in the admin's own plain idiom. The digest is
// shown because the only people who see this page are the ones who read logs.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[render error]', error.digest ?? '(no digest)', error);
  }, [error]);

  const button: React.CSSProperties = {
    padding: '0.55rem 1rem', borderRadius: 6, border: 'none',
    background: 'var(--ink)', color: '#fff', fontWeight: 600, fontSize: '0.85rem',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <p style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>
          Holoscopic Platform
        </p>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.35rem' }}>That didn&rsquo;t load</h1>
        <p style={{ color: 'var(--ink-mid)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          Something went wrong rendering this page.
        </p>
        {error.digest && (
          <code style={{ display: 'block', marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-light)' }}>
            {error.digest}
          </code>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.25rem' }}>
          <button type="button" onClick={reset} style={button}>Try again</button>
          <Link href="/instances" style={{ color: 'var(--ink-mid)', fontSize: '0.85rem', textDecoration: 'underline' }}>
            Back to instances
          </Link>
        </div>
      </div>
    </div>
  );
}
