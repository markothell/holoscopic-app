// The real chrome, in the tide-line language (PLAN.md §9.2). Scaffold.tsx is
// the placeholder chrome for surfaces that are specified and not yet built;
// anything built for real reaches for this instead.

import Link from 'next/link';

export function Page({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-lg px-5 pb-24 pt-10">{children}</main>;
}

/** A section heading. Quiet, because the topic is the loud thing on the page. */
export function Band({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
      {children}
    </h2>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl bg-card p-5 ${className}`}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      {children}
    </div>
  );
}

/**
 * The one thing to do next. There is at most one of these on a page: this app
 * exists to be opened from an email and answered, so the page's job is to make
 * the answer obvious.
 */
export function Action({ href, onClick, children, disabled = false }: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const cls =
    'inline-flex items-center justify-center rounded-lg bg-ink px-5 py-3 text-[15px] ' +
    'font-medium text-ground transition-opacity hover:opacity-90 disabled:opacity-50';
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

/** A second-rank control: a link that reads as text. */
export function Quiet({ href, onClick, children }: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const cls = 'text-sm text-ink-soft underline decoration-[var(--rule-strong)] underline-offset-4 hover:text-ink';
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{children}</button>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-ink-soft">{children}</p>;
}
