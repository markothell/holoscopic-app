'use client';

import Link from 'next/link';

// The signed-out entry point (FEATURE task). Previously a logged-out visit
// fell straight onto the mock "dummy" community map, which reads as the
// real app and is confusing to land on. This is a minimal holding page
// instead: sign in to reach your real communities, or explicitly opt into
// the mock map as a demo — never the default landing.
export default function LoggedOutLanding({ onTryDemo }: { onTryDemo: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-[max(3rem,env(safe-area-inset-top))]">
      <header className="rise-in mt-auto">
        <p className="eyebrow" style={{ color: 'var(--own)' }}>Unison</p>
        <h1 className="display mt-3 text-6xl leading-[0.95]">
          A group,<br /><span style={{ color: 'var(--own)' }}>in weave</span>
        </h1>
        <p className="mt-4 text-sm text-mist-soft">
          A private, networked blog for a trusted circle. Sign in to open your communities.
        </p>
      </header>

      <section className="rise-in mt-auto flex flex-col gap-3 pt-12" style={{ animationDelay: '0.1s' }}>
        <Link
          href="/login"
          className="w-full rounded-full px-6 py-4 text-center text-base font-semibold"
          style={{ background: 'var(--own)', color: 'var(--dusk-deep)' }}
        >
          Sign in
        </Link>
        <p className="text-center text-sm text-mist-soft">
          New here?{' '}
          <Link className="underline" style={{ color: 'var(--own)' }} href="/signup">
            Create an account
          </Link>
        </p>
        <button
          type="button"
          onClick={onTryDemo}
          className="eyebrow mt-4 text-center text-mist-faint underline"
        >
          Try the demo instead →
        </button>
      </section>
    </main>
  );
}
