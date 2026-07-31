'use client';

import { useEffect } from 'react';

// The page an unhandled throw lands on.
//
// Without this, a backend blip during a Server Component render showed Next's
// stock error screen — in production, the words "Application error: a
// client-side exception has occurred" and nothing else. Somebody who has just
// been asked to write about a person who died should never meet that sentence.
//
// `reset()` re-runs the render, which is the right first move here: nearly
// everything that reaches this page is a fetch that failed once (Render cold
// boot, a phone changing towers), and trying again fixes it.

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on a production stack trace.
    console.error('[chorus] unhandled error', error.digest, error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="eyebrow">Chorus</p>
      <h1 className="voice mt-2 text-[2.25rem] leading-[1.15] text-ink">
        This page didn&rsquo;t load
      </h1>
      <p className="voice mt-5 text-[1.125rem] leading-[1.6] text-ink-soft">
        Something went wrong at our end. Nothing you wrote has been lost.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 w-full rounded-[3px] bg-dial px-5 py-3.5 text-[1rem] font-medium
                   text-card-raised"
      >
        Try again
      </button>
    </main>
  );
}
