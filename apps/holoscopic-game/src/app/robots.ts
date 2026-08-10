import type { MetadataRoute } from 'next';

// holoscopic.io is the one deployment in this repo that WANTS to be found.
//
// It is the front door: the manifesto, the essays, and the pages describing
// each game are how someone arrives at any of this. So this file is an
// allowlist with holes cut in it, rather than the blanket `Disallow: /` that
// every other app here carries.
//
// What gets cut out is anything in one of three categories:
//
//   Private      Signed-in surfaces (/dashboard, /profile, /settings) and the
//                auth routes that lead to them. Nothing here renders usefully
//                to a crawler, and several of them are one-time links.
//   Per-request  Routes that server-render against the backend on every hit —
//                /interview sessions, /a/<activityName>, /frame/<nominationId>.
//                A crawler walking these spends our Fluid CPU to index a page
//                whose content is a live game state by the time anyone reads it.
//   Unbounded    The same three. An activity name or a nomination id is minted
//                by players, so the address space grows with use and a crawler
//                that starts walking it never reaches the end.
//
// This mattered enough to write down because of what happened next door.
// chorus.holoscopic.io served no robots.txt and offered an unbounded tag-filter
// URL space, and a single crawler that found one link walked it at 12,000
// requests per twelve hours — against a memorial with five human visitors a
// day. The cost of an unbounded space is not paid per visitor; it is paid once
// a crawler finds the entrance.
//
// /patterns and /patterns/<patternId> are deliberately left open. The index is
// force-dynamic, so each crawl is a real render, but the space is bounded by
// the number of patterns and the content is worth finding. Worth revisiting if
// that ever stops being true.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Per-request renders over unbounded, player-minted address spaces.
          '/interview/',
          '/a/',
          '/frame/',
          '/sequence/',
          // Authoring and signed-in surfaces.
          '/create/',
          '/dashboard/',
          '/profile/',
          '/settings/',
          // Auth routes, some of which are single-use links.
          '/login',
          '/signup',
          '/forgot-password',
          '/reset-password',
          '/verify-email',
          '/waitlist',
          // Never useful to a crawler, and every hit is a function invocation.
          '/api/',
        ],
      },
    ],
  };
}
