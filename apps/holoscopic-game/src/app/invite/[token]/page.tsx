'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { signOut } from 'next-auth/react';
import UserMenu from '@/components/UserMenu';
import VerifyEmailNotice from '@/components/VerifyEmailNotice';
import { useAuth } from '@/contexts/AuthContext';
import {
  InviteError, InviteService, inviteAppName, inviteDestination,
  type InviteStatus, type InviteView,
} from '@/services/inviteService';
import chrome from '@/app/dashboard/page.module.css';
import styles from '@/components/invite.module.css';

// Where an invitation link lands. Public on purpose — it is not in proxy.ts's
// matcher — because the person holding the link may not have an account yet,
// and sending them to a sign-in form before saying who invited them to what
// reads as a phishing page.

type View =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'closed'; status?: InviteStatus }
  | { kind: 'pending'; invite: InviteView }
  | { kind: 'unverified' }
  | { kind: 'mismatch'; emailHint?: string };

const CLOSED_TEXT: Record<InviteStatus, string> = {
  pending: 'This invitation is no longer open.',
  accepted: 'This invitation has already been accepted.',
  declined: 'This invitation was declined.',
  revoked: 'The host withdrew this invitation.',
  expired: 'This invitation has expired.',
};

// The errors that are really states of the page rather than failures. Anything
// else is reported inline and leaves the page where it was.
function viewFromError(err: unknown): View | null {
  if (!(err instanceof InviteError)) return null;
  if (err.status === 404) return { kind: 'notFound' };
  if (err.code === 'invite_closed') {
    return { kind: 'closed', status: err.body.status as InviteStatus | undefined };
  }
  if (err.code === 'email_unverified') return { kind: 'unverified' };
  if (err.code === 'email_mismatch') {
    return { kind: 'mismatch', emailHint: err.body.emailHint as string | undefined };
  }
  return null;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { userId, isAuthenticated, isLoading: authLoading } = useAuth();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = original; };
  }, []);

  // Waits for auth to settle so a signed-in reader's request carries who they
  // are, and the page does not load twice as the session arrives.
  useEffect(() => {
    if (authLoading || !token) return;
    let cancelled = false;
    InviteService.getByToken(token, userId)
      .then(invite => {
        if (cancelled) return;
        setView(invite.status === 'pending'
          ? { kind: 'pending', invite }
          : { kind: 'closed', status: invite.status });
      })
      .catch(err => {
        if (cancelled) return;
        // A link that cannot be read is, from the reader's side, a link that
        // does not work — the same thing a 404 says.
        setView(viewFromError(err) ?? { kind: 'notFound' });
      });
    return () => { cancelled = true; };
  }, [token, userId, authLoading]);

  const respond = async (accept: boolean) => {
    if (!userId || busy) return;
    setBusy(true);
    setError('');
    try {
      if (accept) {
        const res = await InviteService.acceptToken(userId, token);
        window.location.assign(inviteDestination(res.app, res.path));
        return; // stay busy while the browser leaves
      }
      await InviteService.declineToken(userId, token);
      setView({ kind: 'closed', status: 'declined' });
    } catch (err) {
      const next = viewFromError(err);
      if (next) setView(next);
      else setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
    setBusy(false);
  };

  const here = `/invite/${encodeURIComponent(token ?? '')}`;
  const callback = encodeURIComponent(here);

  let body: React.ReactNode;
  switch (view.kind) {
    case 'loading':
      body = <p className={styles.text}>Loading&hellip;</p>;
      break;
    case 'notFound':
      body = (
        <>
          <p className={styles.lead}>This invitation link does not work.</p>
          <p className={styles.text}>Check that the whole link was copied, or ask whoever sent it for a new one.</p>
        </>
      );
      break;
    case 'closed':
      body = (
        <>
          <p className={styles.lead}>{CLOSED_TEXT[view.status ?? 'pending'] ?? CLOSED_TEXT.pending}</p>
          {view.status !== 'accepted' && (
            <p className={styles.text}>If you still want to join, ask whoever sent it for a new link.</p>
          )}
        </>
      );
      break;
    case 'unverified':
      body = (
        <>
          <p className={styles.lead}>Confirm your email address to accept this invitation.</p>
          <p className={styles.text}>Then come back to this link.</p>
          <VerifyEmailNotice />
        </>
      );
      break;
    case 'mismatch':
      body = (
        <>
          <p className={styles.lead}>
            This invitation was sent to {view.emailHint || 'a different address'}. Sign in with that address.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => signOut({ callbackUrl: `/login?callbackUrl=${callback}` })}
            >
              Sign out
            </button>
          </div>
        </>
      );
      break;
    case 'pending': {
      const { invite } = view;
      body = (
        <>
          <p className={styles.lead}>
            {invite.invitedByName} invited you to {invite.circleTitle}
          </p>
          <p className={styles.text}>A circle on {inviteAppName(invite.app)}.</p>
          {authLoading ? null : isAuthenticated ? (
            <div className={styles.actions}>
              <button type="button" className={styles.button} disabled={busy} onClick={() => respond(true)}>
                Accept
              </button>
              <button type="button" className={styles.quiet} disabled={busy} onClick={() => respond(false)}>
                Decline
              </button>
            </div>
          ) : (
            <div className={styles.actions}>
              <Link href={`/login?callbackUrl=${callback}`} className={styles.button}>Sign in</Link>
              <Link href={`/signup?callbackUrl=${callback}`} className={styles.quiet}>Create an account</Link>
            </div>
          )}
          {error && <p className={styles.error}>{error}</p>}
        </>
      );
      break;
    }
  }

  return (
    <div className={chrome.page}>
      <div className={chrome.grain} />

      <div className={chrome.container}>
        <nav className={chrome.nav}>
          <div className={chrome.navInner}>
            <Link href="/" className={chrome.navHome}>
              Holo<span>scopic</span>
            </Link>
            <UserMenu />
          </div>
        </nav>

        <div className={chrome.header}>
          <h1 className={chrome.title}>Invitation</h1>
        </div>

        <div className={chrome.divider} />

        <div className={`${chrome.cards} ${styles.section}`}>{body}</div>

        <footer className={chrome.footer}>
          <div className={chrome.footerInner}>
            <Link href="/" className={chrome.footerLink}>Home</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
