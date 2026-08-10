import type { MetadataRoute } from 'next';

// admin.holoscopic.io is the platform admin console. Nothing here has any
// business in a search index.
//
// This is the strongest case in the repo for a blanket disallow, and it is the
// one that had no robots.txt for longest. Every page is a signed-in operator
// surface over instance configuration, membership and traffic — the closest
// thing this platform has to a control panel. A crawler indexing even the login
// page advertises where the console lives.
//
// It is also the cheapest thing to get wrong quietly: the admin sees little
// traffic, so a crawler walking it would not show up as a load problem the way
// Chorus did. It would simply sit in an index until someone noticed.
//
// This is a request, honoured only by crawlers that ask. It is not access
// control — that is `requireAdmin` in the backend, and it is what actually
// keeps anyone out.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
