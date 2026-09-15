'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Route-segment error boundary, on the game's own paper and type.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest ties this to the server-side log line for the same failure.
    console.error('[render error]', error.digest ?? '(no digest)', error);
  }, [error]);

  return (
    <main className="flex min-h-dvh bg-paper text-ink">
      <div className="mx-auto flex max-w-md flex-col justify-center px-6">
        <p className="eyebrow">On a Spectrum</p>
        <h1 className="mt-2 font-display text-5xl font-bold uppercase leading-[0.95]">
          That didn&rsquo;t load
        </h1>
        <p className="mt-5 font-story text-xl leading-relaxed text-ink-soft">
          Something went wrong on our side. Trying again usually works.
        </p>
        <div className="mt-8 flex items-center gap-6 font-mono-ui text-sm uppercase tracking-[0.12em]">
          <button
            type="button"
            onClick={reset}
            className="cursor-pointer rounded-md bg-ink px-5 py-2.5 text-paper"
          >
            Try again
          </button>
          <Link href="/" className="text-ay underline underline-offset-4">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
