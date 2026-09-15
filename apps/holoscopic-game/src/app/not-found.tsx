import Link from 'next/link';

// Unmatched routes. Without this file Next rendered its own unstyled 404, the
// one page on the site that did not look like the site. Same shape and palette
// as error.tsx.
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
        background: 'var(--bg-primary, #F7F4EF)',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', color: 'var(--ink, #0F0D0B)' }}>
        This page does not exist
      </h1>
      <p style={{ maxWidth: '32rem', color: 'var(--ink-muted, #6B6560)' }}>
        The link may be old, or the address mistyped.
      </p>
      <Link
        href="/"
        style={{
          padding: '0.5rem 1.25rem',
          background: 'var(--accent, #C83B50)',
          color: '#fff',
          borderRadius: '4px',
          textDecoration: 'none',
        }}
      >
        Go home
      </Link>
    </main>
  );
}
