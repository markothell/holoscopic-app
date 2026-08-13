'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

// The traffic beacon. One page view per navigation, and — where a page asks
// for it — one event per link click.
//
// MIRRORED in apps/chorus, apps/spectrum, apps/synthesis and apps/threshold.
// This copy is the one that differs beyond its type union, because
// holoscopic.io is THREE products served from one Next deployment and only this
// app knows which of its own routes is which. It is not in a package because
// the apps that need it do not share one: chorus, spectrum and threshold have
// no dependency on @hs/activities, and giving a memorial app the whole activity
// engine to import forty lines of fetch would be a worse trade than five copies
// of a leaf file that changes approximately never. The server validates `app`
// against an allowlist (utils/traffic.js#APPS), so a drifted copy fails loudly
// as a dropped event rather than quietly as a wrong number.
//
// WHAT IT DOES NOT DO is the reason it can run without a cookie banner: no
// cookie, no localStorage, no id of any kind. The server derives an anonymous
// per-day visitor hash from the connection (see models/TrafficEvent.js), and
// this file has no way to influence or even observe it.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

type App = 'site' | 'interview' | 'map-sequence';

// Which product a path belongs to.
//
// Read from the route rather than stored anywhere, because the route IS the
// fact here — there is no `Instance.app` to consult for a marketing page, and
// three products genuinely share one deployment (root CLAUDE.md: interView and
// Map+Sequence both live in this app, alongside the holoscopic.io homepage).
//
// Ordered longest-prefix-first, and 'site' is the fallback rather than a
// listed set: a page added tomorrow counts as the marketing site, which is
// where a new page almost always belongs and is the harmless way to be wrong.
const INTERVIEW = ['/interview', '/a/', '/sequence', '/play', '/topics', '/inquiry', '/algorithms', '/frame', '/patterns'];
const MAP_SEQUENCE = ['/create', '/map-sequence'];

export function appForPath(pathname: string): App {
  if (MAP_SEQUENCE.some(p => pathname === p || pathname.startsWith(`${p}/`))) return 'map-sequence';
  if (INTERVIEW.some(p => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`))) {
    return 'interview';
  }
  return 'site';
}

interface Props {
  /**
   * Paths whose link clicks are recorded. Empty everywhere by default.
   *
   * A list rather than a boolean because the root layout is a Server Component
   * and cannot know which page it is wrapping — it states the policy once, and
   * this component applies it per navigation. Today that policy is "the
   * homepage", which is where the question 'which of these links do people
   * take' is actually being asked.
   */
  clickPaths?: string[];
}

type Payload = {
  app: App;
  type: 'view' | 'click';
  path: string;
  target?: string;
  label?: string;
  /** Where this visit came from. First view of a page load only — see entryReferrer. */
  referrer?: string;
};

/**
 * Where this visit came from, or '' when the question does not apply.
 *
 * Sent explicitly, because the `Referer` header of the beacon's own request
 * cannot answer it: a fetch made BY a page carries THAT PAGE as its referer, so
 * the server was recording every visit as having arrived from the site it was
 * already on. Every referrer host stored before this line existed is that.
 *
 * Reported on the first view of a page load and never again. `document.referrer`
 * does not change across client-side navigation, so sending it every time would
 * credit the link somebody arrived on for all six pages they went on to read.
 * That matters most here: this app serves three products, so a visit that lands
 * on the homepage and walks into interView would otherwise report the same
 * external referrer against both.
 *
 * Same-origin is dropped — our own previous page is not a source of traffic.
 * Another of OUR domains is kept, because holoscopic.io → threshold.holoscopic.io
 * is exactly the handoff worth being able to see.
 */
function entryReferrer(): string {
  const referrer = document.referrer || '';
  if (!referrer) return '';
  try {
    if (new URL(referrer).origin === window.location.origin) return '';
  } catch {
    return '';   // Unparseable is not attributable.
  }
  return referrer;
}

/**
 * Run after the page has finished loading and the main thread is free.
 *
 * A view report is worth nothing to the person reading the page, so it must
 * never compete with the page for a phone's one slow connection. Firing on
 * mount put it in flight alongside the app's own late-loading chunks — after
 * first paint, but inside the window where the browser is still working and
 * still showing a loading indicator.
 *
 * The 2s timeout is the ceiling: on a busy page idle may never come, and a
 * view that is never reported is a wrong number rather than a cheap one.
 */
function whenIdle(fn: () => void) {
  const run = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 2000 });
    else setTimeout(fn, 0);   // Safari has no requestIdleCallback
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}

function post(payload: Payload) {
  try {
    void fetch(`${API_BASE}/traffic/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // Survives the navigation that caused it. Without this a click on an
      // outbound link is a race between the request and the page unloading,
      // and the outbound links are the ones worth counting.
      keepalive: true,
    }).catch(() => {});
  } catch {
    // A blocked request, an ad blocker, an offline phone. Analytics failing is
    // never allowed to surface anywhere near a reader.
  }
}

function send(payload: Payload) {
  // Clicks are NOT deferred. A click is usually a navigation, and waiting for
  // idle on a page that is already unloading loses the event — which is the
  // one thing keepalive exists to prevent. A click also costs nothing to send
  // immediately: the page it would compete with is on its way out.
  if (payload.type === 'click') post(payload);
  else whenIdle(() => post(payload));
}

export default function Beacon({ clickPaths = [] }: Props) {
  const pathname = usePathname();
  // React runs effects twice in development's StrictMode, and the App Router
  // re-runs this on every navigation. Without remembering the last path sent,
  // dev double-counts everything and a shallow re-render inflates a real page.
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastSent.current === pathname) return;
    // Nothing sent yet on this mount means this is the page somebody actually
    // landed on, which is the only view a referrer belongs to.
    const isEntry = lastSent.current === null;
    lastSent.current = pathname;
    send({
      app: appForPath(pathname),
      type: 'view',
      path: pathname,
      ...(isEntry ? { referrer: entryReferrer() } : {}),
    });
  }, [pathname]);

  const tracksClicks = !!pathname && clickPaths.includes(pathname);

  useEffect(() => {
    if (!tracksClicks) return;

    // Delegated rather than per-link, so it covers links this component has
    // never heard of — including ones rendered by a server component after
    // hydration — without any of them needing to know analytics exists.
    function onClick(event: MouseEvent) {
      const el = event.target as HTMLElement | null;
      const anchor = el?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      send({
        app: appForPath(pathname || '/'),
        type: 'click',
        path: pathname || '/',
        target: href,
        // What the link SAID. The wording of a homepage link is the thing
        // being tested; the href alone cannot tell you which wording won.
        label: (anchor.textContent || '').trim().slice(0, 80),
      });
    }

    // Capture phase: a React onClick handler that calls preventDefault or
    // stops propagation would otherwise swallow the event before it bubbles
    // to the document, and those are exactly the interesting buttons.
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, [pathname, tracksClicks]);

  return null;
}
