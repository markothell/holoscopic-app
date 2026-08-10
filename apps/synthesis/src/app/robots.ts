import type { MetadataRoute } from 'next';

// Nothing on synthesis.holoscopic.io is for crawlers.
//
// Synthesis is a pseudonymous group blog. The pseudonymity is the product: a
// post is meant to be readable by the community it was written for, under a
// name its author chose for that community. Handing those posts to a search
// index is a different promise from the one anyone agreed to, and it is not
// ours to change on their behalf.
//
// The load argument applies too. The map is the home surface and the address
// space is a graph minted by writing — a node per thought, and the reply maps
// hanging off each one — so it grows with use and has no natural end for a
// crawler to reach.
//
// This app is still in development. That is the reason to write the file now
// rather than later: the crawl that hurt Chorus arrived long before its launch,
// off a single link that reached somewhere public.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
