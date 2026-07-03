import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Validates the [session] segment against a strict (no-fallback) lookup.
// Unknown game slugs surface an error instead of silently loading the
// default game — the x-instance-id header alone would fall back.
export default async function SessionLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ session: string }>;
}) {
  const { session } = await params;

  let known = false;
  let unreachable = false;
  try {
    const res = await fetch(`${API_URL}/instances/resolve/${encodeURIComponent(session)}`, { cache: 'no-store' });
    known = res.ok;
  } catch {
    unreachable = true;
  }

  if (!known && !unreachable) {
    return (
      <div style={{
        minHeight: '100vh', background: '#F7F4EF',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <p style={{
            fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.62rem',
            letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C83B50',
            margin: '0 0 0.75rem',
          }}>
            Unknown game
          </p>
          <h1 style={{
            fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '1.6rem',
            fontWeight: 600, color: '#0F0D0B', margin: '0 0 0.75rem', lineHeight: 1.3,
          }}>
            There&apos;s no game at /interview/{session}
          </h1>
          <p style={{
            fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.72rem',
            color: '#6B6560', lineHeight: 1.6, margin: '0 0 1.5rem',
          }}>
            The address may be mistyped, or the game may not exist yet.
          </p>
          <Link href="/interview" style={{
            fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.62rem',
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: '#C83B50', border: '1px solid #C83B50', borderRadius: 999,
            padding: '0.55rem 1.25rem', textDecoration: 'none',
          }}>
            Go to the current game →
          </Link>
        </div>
      </div>
    );
  }

  // If the backend is unreachable we render children anyway — the pages have
  // their own loading/error states and the client retries.
  return <>{children}</>;
}
