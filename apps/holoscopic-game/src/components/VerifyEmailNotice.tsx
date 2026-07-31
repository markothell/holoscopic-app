'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import styles from './VerifyEmailNotice.module.css';

// A quiet nudge for an account that has not confirmed its address yet.
//
// Read LIVE from the user record rather than from the session. The NextAuth
// JWT lasts 30 days, so a flag carried in it would keep telling somebody to
// confirm their email for a month after they had — which trains people to
// ignore the banner, and would be worse than not having one.
//
// Renders nothing at all when the address is confirmed, when nobody is signed
// in, or while the check is in flight. An account that predates verification is
// stamped confirmed by scripts/backfill-email-verified.js, so no existing user
// meets this.

export default function VerifyEmailNotice() {
  const { userId } = useAuth();
  const [unverified, setUnverified] = useState(false);
  const [email, setEmail] = useState('');
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      try {
        // Self reads get the full record (routes/auth.js GET /user/:id).
        const data = await apiFetch(`/auth/user/${userId}`, { userId });
        if (cancelled || !data?.user) return;
        setUnverified(data.user.emailVerified === false);
        setEmail(data.user.email || '');
      } catch {
        // A failed check stays silent. Nagging somebody because a request
        // failed is worse than missing one nudge.
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  if (!unverified) return null;

  const resend = async () => {
    setResent(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';
      await fetch(`${apiUrl}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Same reasoning as above — the backend answers identically regardless.
    }
  };

  return (
    <div className={styles.notice}>
      <p className={styles.text}>
        {resent ? (
          <>A new confirmation link is on its way to {email}.</>
        ) : (
          <>
            Confirm {email || 'your email address'} to join games with other
            people. Everything public is open to you either way.
          </>
        )}
      </p>
      {!resent && (
        <button type="button" onClick={resend} className={styles.action}>
          Resend the link
        </button>
      )}
    </div>
  );
}
