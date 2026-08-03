'use client';

import { useState } from 'react';
import styles from './page.module.css';

// COPY RULE (project-wide): every line says what a thing IS. No "not a…", no
// "instead of…", no defining by contrast.

export default function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';
      const res = await fetch(`${apiUrl}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Email mo@holoscopic.io directly and it will reach me.');
        setIsLoading(false);
        return;
      }
      setSent(true);
    } catch {
      setError('Could not reach the server. Email mo@holoscopic.io directly and it will reach me.');
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <>
        <p className={styles.sent}>
          Got it — thank you. I read these myself, and I&apos;ll write back to {email}.
        </p>
        <p className={styles.sentNote}>
          You&apos;ll hear from me within a day. If it&apos;s urgent,
          mo@holoscopic.io reaches the same inbox.
        </p>
      </>
    );
  }

  return (
    <>
      <p className={styles.lede}>
        Questions, an idea for a game, a memorial you want help setting up, or
        something that broke — this reaches me directly.
      </p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div>
          <label htmlFor="name" className={styles.fieldLabel}>
            Your name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="name"
            className={styles.fieldInput}
            placeholder="How should I address you?"
            disabled={isLoading}
          />
        </div>

        <div>
          <label htmlFor="email" className={styles.fieldLabel}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={styles.fieldInput}
            placeholder="you@example.com"
            disabled={isLoading}
          />
        </div>

        <div>
          <label htmlFor="message" className={styles.fieldLabel}>
            Message
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            maxLength={5000}
            className={styles.fieldTextarea}
            placeholder="Whatever&rsquo;s on your mind."
            disabled={isLoading}
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button type="submit" disabled={isLoading} className={styles.submitBtn}>
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </form>

      <p className={styles.direct}>
        You can also write to{' '}
        <a href="mailto:mo@holoscopic.io" className={styles.directLink}>
          mo@holoscopic.io
        </a>
        .
      </p>
    </>
  );
}
