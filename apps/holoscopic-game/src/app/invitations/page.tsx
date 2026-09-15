'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import VerifyEmailNotice from '@/components/VerifyEmailNotice';
import { useAuth } from '@/contexts/AuthContext';
import {
  InviteError, InviteService, inviteAppName, inviteDestination,
  type HostedCircle, type InviteStatus, type InviteView,
} from '@/services/inviteService';
import chrome from '@/app/dashboard/page.module.css';
import styles from '@/components/invite.module.css';

// Both sides of circle invitations for one account: the ones waiting for you,
// and — if you host a circle — making links and keeping track of the ones you
// sent. Signed-in only (proxy.ts).

const STATUS_LABEL: Record<InviteStatus, string> = {
  pending: 'Waiting',
  accepted: 'Accepted',
  declined: 'Declined',
  revoked: 'Revoked',
  expired: 'Expired',
};

function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function acceptErrorText(err: unknown): string {
  if (err instanceof InviteError) {
    if (err.code === 'email_unverified') return 'Confirm your email address first.';
    if (err.code === 'email_mismatch') {
      const hint = typeof err.body.emailHint === 'string' ? err.body.emailHint : 'a different address';
      return `This was sent to ${hint}. Sign in with that address.`;
    }
    if (err.code === 'invite_closed') return 'This invitation is no longer open.';
    if (err.status === 404) return 'This invitation no longer exists.';
  }
  return err instanceof Error ? err.message : 'Something went wrong. Try again.';
}

export default function InvitationsPage() {
  const { userId } = useAuth();

  const [mine, setMine] = useState<InviteView[] | null>(null);
  const [emailUnverified, setEmailUnverified] = useState(false);
  const [mineFailed, setMineFailed] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const [hosted, setHosted] = useState<HostedCircle[]>([]);
  const [circleId, setCircleId] = useState('');
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [made, setMade] = useState<{ link: string; email: string } | null>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = original; };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    InviteService.mine(userId)
      .then(d => {
        if (cancelled) return;
        setMine(d.invites);
        setEmailUnverified(d.emailUnverified);
      })
      .catch(() => { if (!cancelled) setMineFailed(true); });
    // Hosting fails silently: the section only exists for hosts, and hiding it
    // is the same thing a non-host sees.
    InviteService.hosting(userId)
      .then(circles => {
        if (cancelled) return;
        setHosted(circles);
        setCircleId(prev => prev || circles[0]?.id || '');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const respond = async (invite: InviteView, accept: boolean) => {
    if (!userId || rowBusy) return;
    setRowBusy(invite.id);
    setRowError(prev => ({ ...prev, [invite.id]: '' }));
    try {
      if (accept) {
        const res = await InviteService.accept(userId, invite.id);
        window.location.assign(inviteDestination(res.app, res.path));
        return;
      }
      await InviteService.decline(userId, invite.id);
      setMine(prev => prev?.filter(i => i.id !== invite.id) ?? prev);
    } catch (err) {
      setRowError(prev => ({ ...prev, [invite.id]: acceptErrorText(err) }));
    }
    setRowBusy(null);
  };

  const makeLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !circleId || !email.trim() || creating) return;
    setCreating(true);
    setCreateError('');
    setMade(null);
    setCopy('idle');
    try {
      const { invite, token } = await InviteService.create(userId, circleId, email.trim());
      // The token is never returned again, so this is the only moment the
      // link can be built. It lives in component state and nowhere else.
      setMade({ link: `${window.location.origin}/invite/${token}`, email: invite.email });
      setHosted(prev => prev.map(c => (c.id === circleId ? { ...c, invites: [invite, ...c.invites] } : c)));
      setEmail('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not make a link. Try again.');
    }
    setCreating(false);
  };

  const copyLink = async () => {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.link);
      setCopy('copied');
    } catch {
      // No clipboard API (an insecure origin, or permission refused). The link
      // is already on screen in a selectable field, so say so.
      setCopy('failed');
    }
  };

  const revoke = async (inviteId: string) => {
    if (!userId || revoking) return;
    setRevoking(inviteId);
    try {
      const updated = await InviteService.revoke(userId, inviteId);
      setHosted(prev => prev.map(c => ({
        ...c,
        invites: c.invites.map(i => (i.id === inviteId ? updated : i)),
      })));
    } catch {
      // Leave the row as it was; a failed revoke that looks successful would
      // leave a live link the host believes is dead.
    }
    setRevoking(null);
  };

  return (
    <div className={chrome.page}>
      <div className={chrome.grain} />

      <div className={chrome.container}>
        <nav className={chrome.nav}>
          <div className={chrome.navInner}>
            <Link href="/" className={chrome.navHome}>
              Holo<span>scopic</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <Link href="/dashboard" className={chrome.navLabel}>Dashboard</Link>
              <UserMenu />
            </div>
          </div>
        </nav>

        <div className={chrome.header}>
          <h1 className={chrome.title}>Invitations</h1>
        </div>

        <div className={chrome.divider} />

        <div className={chrome.cards}>
          {/* (a) Invitations to you */}
          <section className={styles.section}>
            <h2 className={styles.label}>Your invitations</h2>
            {emailUnverified && (
              <>
                <p className={styles.text}>
                  Invitations are matched to your confirmed email address, so none can show until it is confirmed.
                </p>
                <VerifyEmailNotice />
              </>
            )}
            {mineFailed ? (
              <p className={styles.text}>Your invitations could not be loaded. Try again in a moment.</p>
            ) : mine === null ? (
              <p className={styles.text}>Loading&hellip;</p>
            ) : mine.length === 0 ? (
              !emailUnverified && <p className={styles.text}>Nothing waiting.</p>
            ) : (
              <ul className={styles.list}>
                {mine.map(invite => (
                  <li key={invite.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <p className={styles.rowTitle}>{invite.circleTitle}</p>
                      <p className={styles.rowMeta}>
                        {inviteAppName(invite.app)} &middot; from {invite.invitedByName}
                        {shortDate(invite.expiresAt) && <> &middot; until {shortDate(invite.expiresAt)}</>}
                      </p>
                      {rowError[invite.id] && <p className={styles.error}>{rowError[invite.id]}</p>}
                    </div>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.button}
                        disabled={rowBusy !== null}
                        onClick={() => respond(invite, true)}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className={styles.quiet}
                        disabled={rowBusy !== null}
                        onClick={() => respond(invite, false)}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {hosted.length > 0 && (
            <>
              {/* (b) Make a link */}
              <section className={styles.section}>
                <h2 className={styles.label}>Invite someone</h2>
                <form className={styles.form} onSubmit={makeLink}>
                  {hosted.length > 1 && (
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Circle</span>
                      <select className={styles.input} value={circleId} onChange={e => setCircleId(e.target.value)}>
                        {hosted.map(c => (
                          <option key={c.id} value={c.id}>{c.title}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {hosted.length === 1 && <p className={styles.text}>To {hosted[0].title}</p>}
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Their email</span>
                    <input
                      className={styles.input}
                      type="email"
                      required
                      autoComplete="off"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </label>
                  <button type="submit" className={styles.button} disabled={creating || !email.trim()}>
                    {creating ? 'Making…' : 'Make link'}
                  </button>
                  {createError && <p className={styles.error}>{createError}</p>}
                </form>

                {made && (
                  <div className={styles.linkBox}>
                    <span className={styles.fieldLabel}>Link for {made.email}</span>
                    <div className={styles.linkRow}>
                      <input
                        className={styles.input}
                        readOnly
                        value={made.link}
                        onFocus={e => e.currentTarget.select()}
                        aria-label="Invitation link"
                      />
                      <button type="button" className={styles.quiet} onClick={copyLink}>
                        {copy === 'copied' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    {copy === 'failed' && (
                      <p className={styles.error}>Copying did not work here. Select the link above and copy it.</p>
                    )}
                    <p className={`${styles.text} ${styles.muted}`} style={{ margin: 0 }}>
                      Send this link in your own email — it works once, for that address.
                    </p>
                  </div>
                )}
              </section>

              {/* (c) What has been sent */}
              <section className={styles.section}>
                <h2 className={styles.label}>Sent</h2>
                {hosted.map(circle => (
                  <div key={circle.id}>
                    <h3 className={styles.circleTitle}>{circle.title}</h3>
                    {circle.invites.length === 0 ? (
                      <p className={styles.text}>No invitations sent yet.</p>
                    ) : (
                      <ul className={styles.list}>
                        {circle.invites.map(sent => (
                          <li key={sent.id} className={styles.row}>
                            <div className={styles.rowMain}>
                              <p className={styles.rowTitle}>{sent.email}</p>
                              <p className={styles.rowMeta}>
                                Sent {shortDate(sent.createdAt)}
                                {sent.respondedAt && <> &middot; answered {shortDate(sent.respondedAt)}</>}
                              </p>
                            </div>
                            <div className={styles.rowActions}>
                              <span className={`${styles.status} ${sent.status === 'pending' ? styles.statusPending : ''}`}>
                                {STATUS_LABEL[sent.status] ?? sent.status}
                              </span>
                              {sent.status === 'pending' && (
                                <button
                                  type="button"
                                  className={styles.quiet}
                                  disabled={revoking !== null}
                                  onClick={() => revoke(sent.id)}
                                >
                                  Revoke
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </section>
            </>
          )}
        </div>

        <footer className={chrome.footer}>
          <div className={chrome.footerInner}>
            <Link href="/dashboard" className={chrome.footerLink}>Dashboard</Link>
            <Link href="/" className={chrome.footerLink}>Home</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
