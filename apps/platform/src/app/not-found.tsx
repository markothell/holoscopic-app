import Link from 'next/link';

// Unmatched routes, in the admin's own plain idiom (inline styles on the
// globals.css variables, as the login page does) rather than Next's stock 404.
export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <p style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>
          Holoscopic Platform
        </p>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.35rem' }}>Nothing here</h1>
        <p style={{ color: 'var(--ink-mid)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          That address doesn&rsquo;t match a page in the admin.
        </p>
        <Link
          href="/instances"
          style={{
            display: 'inline-block', marginTop: '1.25rem', padding: '0.55rem 1rem',
            borderRadius: 6, background: 'var(--ink)', color: '#fff', fontWeight: 600, fontSize: '0.85rem',
          }}
        >
          Back to instances
        </Link>
      </div>
    </div>
  );
}
