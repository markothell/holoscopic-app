import type { MetadataRoute } from 'next';

// Nothing on spectrum.holoscopic.io is for crawlers.
//
// On a Spectrum is played in rounds by a group that was invited to it. Its
// pages are live game state — a map mid-round, a reveal, a set of ratings — and
// state is what a crawler is worst at: by the time an indexed copy is read the
// round has moved, so the only durable effect of indexing it is to publish how
// individual players rated each other.
//
// The cost side is the familiar one. Every game surface server-renders against
// the backend per request, and the address space is minted by play — a game per
// group, a map per round, an entry per player — so it grows rather than
// settling. holoscopic.io finishes being crawled in a few hundred requests
// because it is a finite site; nothing built on the activity engine is.
//
// The front door for this game is its page on holoscopic.io, which stays
// indexed. That is the right thing to find in a search result.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
