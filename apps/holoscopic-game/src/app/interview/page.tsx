import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// /interview → redirect to the default game's session by its real slug.
// When multiple games run at once, this becomes a game-listing page.
export const dynamic = 'force-dynamic';

export default async function InterViewIndexPage() {
  let slug: string | null = null;
  try {
    const res = await fetch(`${API_URL}/instances/current`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      slug = data?.instance?.slug ?? null;
    }
  } catch {
    // fall through to home — better than guessing a slug
  }
  redirect(slug ? `/interview/${slug}` : '/');
}
