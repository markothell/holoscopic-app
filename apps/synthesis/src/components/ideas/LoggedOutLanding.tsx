'use client';

import Link from 'next/link';

// The signed-out front door for synthesis.holoscopic.io — a door, not a pitch.
//
// The explaining lives on the home domain at holoscopic.io/synthesis, the same
// way interView and Map + Sequence are introduced there and played elsewhere.
// Anyone arriving at this subdomain either has an account or has been handed a
// link, so the job here is to get them inside. Carrying the marketing copy on
// both domains meant two places to keep true.
//
// COPY RULE (project-wide): every line says what a thing IS. No "not a…",
// no "instead of…", no defining by contrast.

export default function LoggedOutLanding({ onTryDemo }: { onTryDemo: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-[max(3.5rem,env(safe-area-inset-top))]">

      <header className="rise-in mt-auto">
        <p className="eyebrow" style={{ color: 'var(--own)' }}>Synthesis</p>
        <h1 className="display mt-3 text-6xl leading-[0.95]">
          Find the words<br />
          <span style={{ color: 'var(--synthesis)' }}>a group shares</span>
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-mist-soft">
          A group thinks together on one idea, out in the open, and works toward
          a single statement all of them stand behind.
        </p>
        <div className="mt-7 flex flex-col gap-3">
          <Link
            href="/signup"
            className="w-full rounded-full px-6 py-4 text-center text-base font-semibold"
            style={{ background: 'var(--own)', color: 'var(--dusk-deep)' }}
          >
            Start an idea
          </Link>
          <Link
            href="/login"
            className="w-full rounded-full border px-6 py-3.5 text-center text-sm"
            style={{ borderColor: 'var(--line-strong)', color: 'var(--mist-soft)' }}
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* The demo opt-in keeps its own quiet line above the footer. It is the
          only way into `demoMode` (page.tsx), so it survives the trim — a
          deliberately temporary look at the seed corpus, never a fallback. */}
      <footer className="mt-auto pt-10">
        <button
          type="button"
          onClick={onTryDemo}
          className="eyebrow w-full text-center !text-[0.6rem] text-mist-faint underline"
        >
          Look around a sample idea &rarr;
        </button>
        <p
          className="eyebrow mt-6 border-t pt-6 !text-[0.6rem]"
          style={{ color: 'var(--mist-faint)', borderColor: 'var(--line)' }}
        >
          <a href="https://holoscopic.io/synthesis" className="underline">
            What Synthesis is
          </a>
          {' · '}
          <a href="https://holoscopic.io" className="underline">holoscopic.io</a>
        </p>
      </footer>
    </main>
  );
}
