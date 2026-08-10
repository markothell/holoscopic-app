import type { MetadataRoute } from 'next';

// Nothing on threshold.holoscopic.io is for crawlers.
//
// A circle is a named group working through a polarity together over weeks.
// Its pages are for the people in it, reached from the mail a phase transition
// sends — there is no page here anyone would want to arrive at from a search
// result, and several of them show where individual members placed themselves.
//
// The load argument is the same one that cost us on Chorus, and it applies
// harder here. Every participant surface server-renders against the backend per
// request, and the address space is minted by use: a circle per group, a topic
// per circle, a story per member. A crawler that finds one circle link finds a
// tree that grows as the product succeeds.
//
// Threshold is also the one app whose rounds advance on a background tick
// rather than sweep-on-read, so crawler traffic buys nothing at all — it cannot
// even be said to keep anything warm.
//
// Written when this went live (2026-08-10) rather than after the first crawl,
// because the same omission on Chorus was found at 12,000 requests per twelve
// hours against five human visitors a day.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
