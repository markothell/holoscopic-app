import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// /interview → redirect to the default game's session by its real slug.
// When multiple games run at once, this becomes a game-listing page.
export const dynamic = 'force-dynamic';

// The backend can be mid cold-boot (Render spins the service down when idle,
// then spends several seconds reconnecting Mongo before routes are live) —
// one attempt during that window reads as a network error or a non-2xx, and
// used to bounce straight home. Two attempts absorb that blip without
// resorting to guessing a slug on a real outage.
async function fetchDefaultSlug(attempt: number): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/instances/current`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`/interview: instances/current returned ${res.status} (attempt ${attempt})`);
      return null;
    }
    const data = await res.json();
    return data?.instance?.slug ?? null;
  } catch (err) {
    console.error(`/interview: instances/current fetch failed (attempt ${attempt})`, err);
    return null;
  }
}

export default async function InterViewIndexPage() {
  let slug = await fetchDefaultSlug(1);
  if (!slug) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    slug = await fetchDefaultSlug(2);
  }
  redirect(slug ? `/interview/${slug}` : '/');
}
