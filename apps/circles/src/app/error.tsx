'use client';

import { useEffect } from 'react';
import { Page, Action, Muted, Quiet } from '@/components/Shell';

// Route-segment error boundary: a render-time throw replaces the page body and
// keeps the chrome, so the way back stays on screen.
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
    <Page>
      <div className="mt-16 max-w-md">
        <h1 className="text-4xl leading-tight">That didn&rsquo;t load</h1>
        <div className="mt-4 text-[17px] leading-relaxed">
          <Muted>Something went wrong on our side. Trying again usually works.</Muted>
        </div>
        <div className="mt-8 flex items-center gap-5">
          <Action onClick={reset}>Try again</Action>
          <Quiet href="/">Go home</Quiet>
        </div>
      </div>
    </Page>
  );
}
