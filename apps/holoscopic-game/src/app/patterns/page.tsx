import { redirect } from 'next/navigation';
import { fetchDefaultGameSlug } from '@/lib/defaultGame';

// /patterns → the default game's patterns view.
//
// This used to redirect to a hardcoded `/interview/g1/patterns`. The slug g1 is
// not guaranteed to be the live edition — getDefault() picks the lowest-numbered
// ACTIVE instance — so the moment g1 ends or is renamed, every link here lands
// on the layout's "There's no game at /interview/g1" screen. Resolving the slug
// is the same thing /interview does one directory over.
export const dynamic = 'force-dynamic';

export default async function PatternsRedirect() {
  const slug = await fetchDefaultGameSlug();
  redirect(slug ? `/interview/${slug}/patterns` : '/');
}
