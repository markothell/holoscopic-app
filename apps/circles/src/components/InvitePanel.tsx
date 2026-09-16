'use client';

import { useCallback, useEffect, useState } from 'react';
import { invitesApi, ApiError, SITE_URL } from '@/services/api';
import type { Circle, InviteStatus, SentInvite } from '@/lib/types';
import { Band, Card } from '@/components/Shell';

// The host's side of invitations, on the circle it belongs to.
//
// There is no invitation mail by design (backend utils/invites.js): the server
// makes a single-use link for ONE address and hands back the token exactly
// once; the host sends it in their own words. So the link is shown at the
// moment it is made and never again — re-inviting the same address makes a new
// link and revokes the old one.
//
// holoscopic.io/invitations reads the same rows (the invites router is not
// instance-scoped), so this is a second door onto one list, not a copy.

const STATUS_LABEL: Record<InviteStatus, string> = {
  pending: 'Waiting',
  accepted: 'Took their seat',
  declined: 'Declined',
  revoked: 'Withdrawn',
  expired: 'Expired',
};

function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function InvitePanel({ circle, userId }: { circle: Circle; userId: string }) {
  const [sent, setSent] = useState<SentInvite[] | null>(null);
  const [email, setEmail] = useState('');
  const [made, setMade] = useState<{ link: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { circles } = await invitesApi.hosting(userId);
      setSent(circles.find(c => c.id === circle.id)?.invites ?? []);
    } catch {
      // A panel that cannot list is still a panel that can invite; the form
      // below stays usable rather than the whole section failing.
      setSent([]);
    }
  }, [userId, circle.id]);

  useEffect(() => { void load(); }, [load]);

  const makeLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const { invite, token } = await invitesApi.create(userId, circle.id, email.trim());
      // The only moment this link exists in readable form. It lives in
      // component state and nowhere else — not in the database, which stores
      // only its SHA-256.
      setMade({ link: `${SITE_URL}/invite/${token}`, email: invite.email });
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not make a link');
    }
    setBusy(false);
  };

  const copy = async () => {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.link);
      setCopied(true);
    } catch {
      // No clipboard API (an insecure origin, or permission refused). The link
      // is selectable above, so this is a nudge rather than a failure.
      setError('Copying did not work here — select the link and copy it.');
    }
  };

  const revoke = async (id: string) => {
    setRevoking(id);
    try {
      await invitesApi.revoke(userId, id);
      await load();
    } catch {
      // Leave the row as it was: a failed revoke that looked successful would
      // leave a live link the host believes is dead.
    }
    setRevoking(null);
  };

  return (
    <div className="mt-10">
      <Band>Invitations</Band>
      <Card>
        <form onSubmit={makeLink} className="flex flex-wrap items-end gap-3">
          <label className="min-w-[14rem] flex-1">
            <span className="mb-1 block text-sm text-ink-soft">Their email</span>
            <input
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="someone@example.com"
              className="w-full rounded-lg border border-[var(--rule)] bg-ground/40 p-3 text-[15px] outline-none focus:border-[var(--rule-strong)]"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="cursor-pointer rounded-full bg-ink px-5 py-2.5 text-[15px] text-card transition-opacity hover:opacity-85 disabled:opacity-40"
          >
            {busy ? 'Making…' : 'Make link'}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-ochre">{error}</p>}

        {made && (
          <div className="mt-4 rounded-xl bg-ground-deep p-4">
            <span className="block text-sm text-ink-soft">Link for {made.email}</span>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                readOnly
                value={made.link}
                onFocus={e => e.currentTarget.select()}
                aria-label="Invitation link"
                className="min-w-[14rem] flex-1 rounded-lg border border-[var(--rule)] bg-card p-2.5 text-sm outline-none"
              />
              <button
                type="button"
                onClick={copy}
                className="cursor-pointer text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-2 text-sm text-ink-faint">
              Send this in your own words. It works once, for that address, for 30 days.
            </p>
          </div>
        )}

        {sent && sent.length > 0 && (
          <ul className="mt-5 space-y-3 border-t border-[var(--rule)] pt-4">
            {sent.map(row => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <span className="text-[15px]">{row.email}</span>
                  <span className="mt-0.5 block text-sm text-ink-faint">
                    {STATUS_LABEL[row.status] ?? row.status}
                    {row.status === 'pending' && row.expiresAt && ` · until ${shortDate(row.expiresAt)}`}
                    {row.respondedAt && ` · ${shortDate(row.respondedAt)}`}
                  </span>
                </div>
                {row.status === 'pending' && (
                  <button
                    type="button"
                    disabled={revoking !== null}
                    onClick={() => revoke(row.id)}
                    className="cursor-pointer text-sm text-ink-soft underline underline-offset-4 hover:text-ink disabled:opacity-40"
                  >
                    Withdraw
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {sent && sent.length === 0 && !made && (
          <p className="mt-4 text-sm text-ink-faint">
            Nobody invited yet. Whoever you invite needs an account on that exact address, with the
            address confirmed — that match is what admits them.
          </p>
        )}
      </Card>
    </div>
  );
}
