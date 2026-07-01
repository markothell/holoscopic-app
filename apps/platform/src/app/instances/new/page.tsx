'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';

export default function NewInstancePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [domains, setDomains] = useState('');
  const [gameVersion, setGameVersion] = useState('1.0');
  const [accessMode, setAccessMode] = useState<'public' | 'invite'>('public');
  const [inviteCodes, setInviteCodes] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!slugEdited) setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  }, [name, slugEdited]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        name, slug,
        domains: domains.split('\n').map(d => d.trim()).filter(Boolean),
        gameVersion,
        access: {
          mode: accessMode,
          inviteCodes: inviteCodes.split('\n').map(c => c.trim()).filter(Boolean),
        },
        startDate: startDate || null,
        endDate: endDate || null,
      };
      const data = await apiFetch('/instances', { method: 'POST', userId: user.id, body: JSON.stringify(body) });
      router.push(`/instances/${data.instance.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || !user) return null;

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', height: 52, display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/instances" style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-light)' }}>← Instances</Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>New Instance</span>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <FieldGroup label="Name">
            <input type="text" required value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="My Community" autoFocus />
          </FieldGroup>

          <FieldGroup label="Slug">
            <input type="text" required value={slug}
              onChange={e => { setSlug(e.target.value); setSlugEdited(true); }}
              style={inputStyle} placeholder="my-community" />
          </FieldGroup>

          <FieldGroup label="Game version" hint="e.g. 1.0 — shown to players in interView">
            <input type="text" value={gameVersion} onChange={e => setGameVersion(e.target.value)} style={inputStyle} placeholder="1.0" />
          </FieldGroup>

          <FieldGroup label="Domains" hint="One per line — e.g. mycommunity.com">
            <textarea rows={3} value={domains} onChange={e => setDomains(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }} placeholder={'mycommunity.com\nwww.mycommunity.com'} />
          </FieldGroup>

          <FieldGroup label="Access">
            <select value={accessMode} onChange={e => setAccessMode(e.target.value as 'public' | 'invite')} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="public">Public</option>
              <option value="invite">Invite only</option>
            </select>
          </FieldGroup>

          {accessMode === 'invite' && (
            <FieldGroup label="Invite codes" hint="One per line">
              <textarea rows={3} value={inviteCodes} onChange={e => setInviteCodes(e.target.value)}
                style={{ ...inputStyle, resize: 'vertical' }} placeholder="CODE-A&#10;CODE-B" />
            </FieldGroup>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <FieldGroup label="Start date">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
            </FieldGroup>
            <FieldGroup label="End date">
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
            </FieldGroup>
          </div>

          {error && <p style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>{error}</p>}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" disabled={submitting} style={primaryBtn}>
              {submitting ? 'Creating…' : 'Create instance'}
            </button>
            <Link href="/instances" style={secondaryBtn}>Cancel</Link>
          </div>
        </form>
      </main>
    </div>
  );
}

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>
        {label}{hint && <span style={{ fontWeight: 300, marginLeft: '0.5rem', textTransform: 'none', letterSpacing: 0 }}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.55rem 0.75rem',
  border: '1px solid var(--border)', borderRadius: 6,
  background: '#fff', color: 'var(--ink)', outline: 'none', fontSize: '0.875rem',
};

const primaryBtn: React.CSSProperties = {
  padding: '0.6rem 1.25rem', borderRadius: 6, border: 'none',
  background: 'var(--ink)', color: '#fff', fontWeight: 600, fontSize: '0.85rem',
};

const secondaryBtn: React.CSSProperties = {
  padding: '0.6rem 1.25rem', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--ink-mid)', fontWeight: 500, fontSize: '0.85rem',
  display: 'inline-flex', alignItems: 'center',
};
