'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { Wordmark } from './Wordmark';

// Toyrok's chrome, in the Toono language: felt ground, larch ink, hairlines
// over boxes. The header renders coherently signed out (P5 generalizes here),
// and per DESIGN.md rule 1 nothing in the chrome ever takes the sky color —
// that belongs to whatever is live on the page itself.

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-5 pb-20">
      <TopBar />
      <main>{children}</main>
    </div>
  );
}

function TopBar() {
  const { data: session, status } = useSession();
  const signedIn = Boolean((session?.user as { id?: string } | undefined)?.id);
  return (
    <div className="mb-10 flex items-center justify-between pt-6">
      <Link href={signedIn ? '/circles' : '/'} aria-label="Toyrok home" className="block">
        <Wordmark size={24} />
      </Link>
      {status !== 'loading' && (
        <nav className="flex items-center gap-5 text-sm text-ink-soft">
          {signedIn ? (
            <>
              <Link href="/circles" className="hover:text-ink">Your circles</Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="cursor-pointer text-ink-faint hover:text-ink"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          )}
        </nav>
      )}
    </div>
  );
}

/** Section label — small caps over a hairline, the board's own idiom. */
export function Band({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 border-t border-[var(--rule)] pt-3 font-[family-name:var(--font-body)] text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
      {children}
    </h2>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">{children}</div>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-ink-soft">{children}</p>;
}

/** Primary action. Ink, not sky — sky belongs to what is live, not to what is
 *  clickable. */
export function Action({ href, onClick, type, disabled, children }: {
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls =
    'inline-block rounded-full bg-ink px-5 py-2.5 text-[15px] text-card transition-opacity ' +
    'hover:opacity-85 disabled:opacity-40 cursor-pointer';
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button type={type || 'button'} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

export function Quiet({ href, onClick, children }: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const cls = 'text-sm text-ink-soft underline underline-offset-4 hover:text-ink cursor-pointer';
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{children}</button>;
}
