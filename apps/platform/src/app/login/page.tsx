'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) router.replace('/instances');
  }, [user, isLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace('/instances');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.6rem 0.75rem',
    border: '1px solid var(--border)', borderRadius: 6,
    background: '#fff', color: 'var(--ink)', outline: 'none', fontSize: '0.9rem',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Holoscopic Platform</h1>
          <p style={{ color: 'var(--ink-light)', fontSize: '0.8rem', marginTop: '0.25rem' }}>Admin access only</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>Email</span>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} autoFocus />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>Password</span>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
          </label>
          {error && <p style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>{error}</p>}
          <button type="submit" disabled={submitting} style={{
            padding: '0.65rem', borderRadius: 6, border: 'none',
            background: 'var(--ink)', color: '#fff', fontWeight: 600,
            fontSize: '0.85rem', opacity: submitting ? 0.6 : 1,
          }}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
