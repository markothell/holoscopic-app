'use client';

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';

// Vercel Web Analytics, wrapped so nothing sensitive reaches it.
//
// THIS FILE IS MIRRORED across the apps whose Vercel project has Web Analytics
// enabled — today chorus, circles, holoscopic-game, synthesis and threshold. It sits
// alongside Beacon.tsx and answers a different question: Vercel measures the
// *edge* (who arrived, from where, on what), our beacon measures the *platform*
// (which of seven products, on permanent counters we own). Neither replaces the
// other, and their numbers will not match: Vercel starts counting the day its
// script ships and drops what an ad blocker eats, ours has been counting since
// the beacon shipped and counts anything that runs JavaScript.
//
// WHY THE WRAPPER EXISTS. Vercel's <Analytics /> sends the full URL, query
// string included, and this repo puts credentials in query strings: Chorus
// hands a curator the whole memorial at `/c/<slug>/curate?k=<curatorKey>`, and
// the game app takes `?token=` on /verify-email and /reset-password. Mounted
// bare, the first curator to open their link would have posted that key to a
// third-party dashboard, where it would sit for the reporting window as a
// working credential in plain text.
//
// So the query string is dropped by default and kept by exception. That is the
// same policy our own beacon applies server-side (utils/traffic.js strips the
// query before storing), which also keeps the two systems' path lists directly
// comparable — the same page cannot be two rows in one tool and one in the
// other.
//
// This is a client component because beforeSend is a function and the root
// layouts are Server Components. Putting 'use client' on a root layout to pass
// one callback would drag every layout provider into the client bundle.

// The exceptions. Campaign parameters are the only query string worth keeping:
// they are attribution, they are already public in the link somebody clicked,
// and they carry nothing about the person who clicked it.
//
// An allowlist rather than a blocklist of known-secret names, because the cost
// of the two mistakes is not symmetric — a forgotten `utm_` variant loses a
// number, a forgotten secret publishes one.
function isCampaignParam(key: string) {
  return key === 'ref' || key.startsWith('utm_');
}

function redact(event: BeforeSendEvent) {
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    // An unparseable URL cannot be redacted, so it is not sent. A dropped view
    // is a number that is slightly low; an unredacted one is a leak.
    return null;
  }

  const kept = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (isCampaignParam(key)) kept.append(key, value);
  });
  url.search = kept.toString();
  // The fragment never reaches a server and is therefore the other place a
  // token could be hiding. Nothing here uses one; it costs nothing to drop.
  url.hash = '';

  return { ...event, url: url.toString() };
}

export default function VercelAnalytics() {
  return <Analytics beforeSend={redact} />;
}
