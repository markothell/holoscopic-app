import type { NextConfig } from "next";

// Redirects for memorial slugs people will reasonably type differently from the
// one the memorial was created with.
//
// A slug is fixed at creation and baked into every link already sent, so it
// cannot be corrected afterwards without breaking those links. When the slug
// carries a misspelling of the person's name, the CORRECT spelling is the
// address people will guess, hand-type, or helpfully "fix" for each other — and
// that address has to land somewhere rather than 404.
//
// 307, not 308: the canonical slug on the right-hand side is itself the
// misspelling, and a permanent redirect gets cached in browsers in a way we
// could not take back if this is ever reorganised.
//
// This list is the ONE thing about a memorial that needs a deploy — everything
// else, from creating one to its vocabulary, is a row in the platform admin. If
// it grows past a handful of entries, that is the signal to put alias slugs on
// the Instance document and resolve them in the backend instead.
const MEMORIAL_ALIASES: { from: string; to: string }[] = [
  // Created as "carloyn"; her name is Carolyn — the blurb, written by hand,
  // spells it correctly. The displayed name is corrected; the slug stays put
  // because the link was already in circulation.
  { from: 'carolynlovewell', to: 'carloynlovewell' },
];

const nextConfig: NextConfig = {
  async redirects() {
    return MEMORIAL_ALIASES.flatMap(({ from, to }) => [
      { source: `/c/${from}`, destination: `/c/${to}`, permanent: false },
      // Everything below the memorial too — /m/<id>, /curate — so a shared link
      // to one memory survives the correction as well.
      { source: `/c/${from}/:path*`, destination: `/c/${to}/:path*`, permanent: false },
    ]);
  },
};

export default nextConfig;
