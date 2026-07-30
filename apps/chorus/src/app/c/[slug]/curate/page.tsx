import { Suspense } from 'react';
import type { Metadata } from 'next';
import CurateClient from './CurateClient';

// Never prerendered and never cached: this URL carries the curator key, and a
// cached copy of a moderation queue is both stale and a small leak. Forcing
// dynamic also satisfies the build, which cannot statically render a page whose
// client reads useSearchParams.
export const dynamic = 'force-dynamic';

// Keep the queue out of search results and link previews. The key already
// gates the data, but there is no reason for the page itself to be indexable.
export const metadata: Metadata = {
  title: 'Curating',
  robots: { index: false, follow: false },
};

export default function CuratePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md px-5 py-12" />}>
      <CurateClient />
    </Suspense>
  );
}
