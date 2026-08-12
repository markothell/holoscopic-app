'use client';

import { useState } from 'react';
import { SignupService } from '@/services/signupService';
import styles from './EmailCapture.module.css';

/**
 * Interest capture — email in, a `Signup` row out (`POST /api/signup`, global
 * and unauthenticated; one row per email per source).
 *
 * It lives here rather than inside the homepage because two surfaces now carry
 * it: the homepage's platform section and the Circles lander. Both write
 * `platform-updates`.
 *
 * `source` is a plain string, deliberately. The Circles lander is a Server
 * Component (it has `metadata`), and a function prop crossing that boundary is
 * a 500 — "Functions cannot be passed directly to Client Components". A caller
 * whose source depends on its own state should hold that state and pass the
 * resolved string; `beforeSubmit` stays a callback because only client callers
 * ever need it.
 */
export default function EmailCapture({
  cta,
  sentNote,
  beforeSubmit,
  source,
}: {
  cta: string;
  sentNote: string;
  /** Returns an error message to show instead of submitting, or null to go. */
  beforeSubmit?: () => string | null;
  source: string;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [note, setNote] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const blocked = beforeSubmit?.();
    if (blocked) {
      setNote(blocked);
      setIsError(true);
      return;
    }
    setStatus('sending');
    setNote(null);
    try {
      await SignupService.create(email, source);
      setStatus('sent');
      setNote(sentNote);
      setIsError(false);
    } catch (err) {
      setStatus('idle');
      setNote(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setIsError(true);
    }
  };

  return (
    <>
      <form className={styles.captureForm} onSubmit={submit}>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
          className={styles.captureInput}
          disabled={status === 'sent'}
        />
        <button
          type="submit"
          className={styles.captureButton}
          disabled={status !== 'idle'}
        >
          {status === 'sending' ? 'Sending…' : cta}
        </button>
      </form>
      {note && (
        <p className={`${styles.captureNote} ${isError ? styles.captureNoteErr : ''}`} role="status">
          {note}
        </p>
      )}
    </>
  );
}
