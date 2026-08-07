'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { thresholdApi, ApiError } from '@/services/api';
import type { Circle, ThresholdNotification } from '@/lib/types';
import { Page, Band, Action, Quiet, Muted } from '@/components/Shell';
import { TideLine } from '@/components/TideLine';

// What the circles have told you, and how to be told less (D31).
//
// THIS IS WHERE THE UNSUBSCRIBE LINK IN EVERY EMAIL LANDS, and it is an
// ordinary logged-in page rather than a signed no-login link. That is not a
// shortcut: `invitedEmails` is a join-time gate and never a mail list, so every
// recipient of circle mail is a member with an account — which means there is
// nothing to sign, no token to forge, and no unauthenticated mutation endpoint
// to defend. The same fact is what makes the `List-Unsubscribe` header safe to
// point here.
//
// MUTING STOPS MAIL, NEVER NOTIFICATIONS. Somebody who mutes a circle has said
// "stop emailing me", not "stop telling me" — so the list above keeps filling,
// and opening the app still shows everything that happened.
//
// The rules people reach for here are about marketing: CAN-SPAM's opt-out
// covers mail whose primary purpose is advertising, GDPR and ePrivacy target
// direct marketing, and the Gmail/Yahoo one-click rules bind bulk senders above
// 5,000 a day. A round transition in an activity somebody joined is none of
// those. Deliverability is the real reason to make stopping easy: a spam
// complaint lands on the sending domain, and that domain also carries password
// resets.

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [notifications, setNotifications] = useState<ThresholdNotification[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [n, c] = await Promise.all([
        thresholdApi.myNotifications(userId),
        thresholdApi.myCircles(userId),
      ]);
      setNotifications(n.notifications);
      setCircles(c.circles);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your settings');
    }
  }, [userId]);

  useEffect(() => {
    if (status === 'loading') return;
    void load();
  }, [status, load]);

  if (status === 'loading') return <Page><Muted>…</Muted></Page>;

  if (!userId) {
    return (
      <Page>
        <h1 className="mb-2 font-[family-name:var(--font-source-serif)] text-3xl">Sign in</h1>
        <Muted>
          Your circles and your mail settings are tied to your account, so this page needs you
          signed in.
        </Muted>
        <div className="mt-5"><Action href="/login">Sign in</Action></div>
      </Page>
    );
  }

  const setMail = async (circle: Circle, optOut: boolean) => {
    setBusy(true);
    try {
      await thresholdApi.setCircleMail(circle.id, optOut, userId);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not save');
    } finally {
      setBusy(false);
    }
  };

  const markRead = async () => {
    try {
      await thresholdApi.markNotificationsRead(userId);
      await load();
    } catch {
      /* reading is not worth an error message */
    }
  };

  const unread = notifications.filter(n => !n.read).length;

  return (
    <Page>
      <header className="mb-8">
        <Quiet href="/me">Your circles</Quiet>
        <h1 className="mt-2 font-[family-name:var(--font-source-serif)] text-3xl leading-tight">
          Being told
        </h1>
        <p className="mt-1 mb-4 text-sm text-ink-faint">
          What the circles have told you, and which ones may email.
        </p>
        <TideLine />
      </header>

      {error && <p className="mb-6 text-sm text-pole-b">{error}</p>}

      <section className="mb-10">
        <Band>Email, per circle</Band>
        {circles.length === 0 ? (
          <Muted>You are not in a circle yet.</Muted>
        ) : (
          <ul className="space-y-3">
            {circles.map(c => (
              <li key={c.id} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href={`/t/${c.urlName}`}
                    className="font-[family-name:var(--font-source-serif)] text-lg underline decoration-[var(--rule)] underline-offset-4"
                  >
                    {c.title}
                  </Link>
                  <p className="text-xs text-ink-faint">
                    {c.myEmailOptOut
                      ? 'No email. It still appears below, and in the app.'
                      : 'Emails you when a round turns over.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMail(c, !c.myEmailOptOut)}
                  disabled={busy}
                  aria-pressed={!c.myEmailOptOut}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                    c.myEmailOptOut
                      ? 'border-[var(--rule-strong)] text-ink-soft hover:border-ink hover:text-ink'
                      : 'border-transparent bg-pole-a text-white'
                  }`}
                >
                  {c.myEmailOptOut ? 'Email me' : 'Emailing'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <Band>What you have been told</Band>
          {unread > 0 && <Quiet onClick={markRead}>Mark all read</Quiet>}
        </div>

        {notifications.length === 0 ? (
          <Muted>Nothing yet. A circle tells you when a round turns over.</Muted>
        ) : (
          <ul className="space-y-3">
            {notifications.map(n => (
              <li key={n.id} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: n.read ? 'transparent' : 'var(--pole-b)' }}
                />
                <div className="min-w-0">
                  <p className={`text-sm leading-relaxed ${n.read ? 'text-ink-soft' : 'text-ink'}`}>
                    {n.circle
                      ? <Link href={`/t/${n.circle.urlName}`} className="underline decoration-[var(--rule)] underline-offset-4">{n.message}</Link>
                      : n.message}
                  </p>
                  <p className="text-xs text-ink-faint">{when(n.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}

function when(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}
