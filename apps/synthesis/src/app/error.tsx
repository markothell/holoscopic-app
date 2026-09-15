'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Route-segment error boundary, on the app's own dusk ground.
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
    <main className="flex min-h-dvh bg-dusk text-mist">
      <div className="mx-auto flex max-w-md flex-col justify-center px-6">
        <p className="font-mono-ui text-xs uppercase tracking-[0.18em] text-mist-faint">Synthesis</p>
        <h1 className="mt-2 font-display text-4xl leading-tight">That didn&rsquo;t load</h1>
        <p className="mt-5 font-ui text-lg leading-relaxed text-mist-soft">
          Something went wrong on our side. Trying again usually works.
        </p>
        <div className="mt-8 flex items-center gap-6 font-ui">
          <button
            type="button"
            onClick={reset}
            className="cursor-pointer rounded-md bg-own px-5 py-2.5 font-medium text-dusk"
          >
            Try again
          </button>
          <Link href="/" className="text-mist-soft underline underline-offset-4 hover:text-mist">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
