import type { MetadataRoute } from 'next';

// Nothing in this deployment is for crawlers.
//
// A memorial is for people who were sent the link (PLAN §8): the person it is
// about did not choose to be written about publicly, and neither did anyone
// named inside a story. Every /c/<slug> page already carries
// `robots: { index: false, follow: false }` in its metadata — but that is a
// tag INSIDE the page, so a crawler can only learn it by fetching the page,
// and fetching the page is the thing that costs us. This file is the version
// that gets read before the first request.
//
// It matters more here than on a normal site because the wall is an unbounded
// URL space. The filter rail offers up to eighteen tag links, each a distinct
// ?tags= address, and each of those pages offers eighteen more; the sort bar
// multiplies that again, and every memory has its own permalink. A crawler
// seeded with one texted link can walk thousands of distinct URLs, and every
// one of them is a full server render against the backend. That is what a
// day with five human visits and thousands of API calls looks like.
//
// Disallow: / with no allowances. There is no page here we would want found.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
