import { redirect } from 'next/navigation';
import { fetchDefaultGameSlug } from '@/lib/defaultGame';

// /interview → redirect to the default game's session by its real slug.
// When multiple games run at once, this becomes a game-listing page.
//
// The cold-boot retry that used to live here is now in lib/defaultGame.ts,
// shared with /patterns — which had been hardcoding a slug instead.
export const dynamic = 'force-dynamic';

export default async function InterViewIndexPage() {
  const slug = await fetchDefaultGameSlug();
  redirect(slug ? `/interview/${slug}` : '/');
}
