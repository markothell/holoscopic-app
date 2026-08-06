'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';

// Which app the new instance belongs to. Picking this is the whole point of
// the field: it decides whether the backend hands out an edition number, which
// config surface the edit page shows, and — for Chorus — whether the instance
// arrives already provisioned as a working memorial.
type AppId = 'interview' | 'spectrum' | 'synthesis' | 'chorus' | 'threshold';

const APPS: { id: AppId; label: string; hint: string }[] = [
  { id: 'interview', label: 'interView',
    hint: 'A numbered edition at holoscopic.io. Gets the next game number and the holon economy.' },
  { id: 'chorus', label: 'Chorus — a memorial',
    hint: 'One person, one memorial. Created ready to use: curator key minted, starting vocabulary planted, economy off. Fill in the subject on the next screen.' },
  { id: 'synthesis', label: 'Synthesis',
    hint: 'A thought space. Ideas are normally created by collaborators in the app itself — make one here only to set up a parent or repair one.' },
  { id: 'spectrum', label: 'On a Spectrum',
    hint: 'Rooms are created by players in the app. Make one here only to set up a parent instance.' },
  { id: 'threshold', label: 'Threshold',
    hint: 'Where a group’s dividing line falls on a polarity. Circles are created by facilitators in the app — make one here to set up the parent instance. Economy off.' },
];

export default function NewInstancePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [app, setApp] = useState<AppId>('interview');
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

  // A Chorus slug is the memorial's public URL (/c/<slug>), so it gets a
  // `chorus-` namespace rather than sitting bare alongside every other
  // instance's slug.
  useEffect(() => {
    if (slugEdited) return;
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setSlug(app === 'chorus' && base ? `chorus-${base}` : base);
  }, [name, slugEdited, app]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        name, slug, app,
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
          {/* First, because it changes what every field below means. */}
          <FieldGroup label="App">
            <select value={app} onChange={e => setApp(e.target.value as AppId)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {APPS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-light)', margin: '0.4rem 0 0', lineHeight: 1.5 }}>
              {APPS.find(a => a.id === app)!.hint}
            </p>
          </FieldGroup>

          <FieldGroup label={app === 'chorus' ? 'Their name' : 'Name'}>
            <input type="text" required value={name} onChange={e => setName(e.target.value)} style={inputStyle}
              placeholder={app === 'chorus' ? 'Ellen Vance' : 'My Community'} autoFocus />
          </FieldGroup>

          <FieldGroup label="Slug" hint={app === 'chorus' ? '— the memorial’s URL: /c/<slug>' : undefined}>
            <input type="text" required value={slug}
              onChange={e => { setSlug(e.target.value); setSlugEdited(true); }}
              style={inputStyle} placeholder={app === 'chorus' ? 'chorus-ellen-vance' : 'my-community'} />
          </FieldGroup>

          {/* Edition numbering and versioning belong to interView alone. */}
          {app === 'interview' && (
            <FieldGroup label="Game version" hint="e.g. 1.0 — shown to players in interView">
              <input type="text" value={gameVersion} onChange={e => setGameVersion(e.target.value)} style={inputStyle} placeholder="1.0" />
            </FieldGroup>
          )}

          {/* Chorus is reached by its /c/<slug> path on the one shared Chorus
              deployment, gates nothing behind invite codes, and has no run
              window — a memorial stays open. None of the three below apply. */}
          {app !== 'chorus' && (
            <>
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
            </>
          )}

          {app === 'chorus' && (
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-light)', lineHeight: 1.6, maxWidth: '34rem' }}>
              Creating this mints the curator key and plants a starting vocabulary, so the memorial
              works the moment it exists. The next screen is where you add the photo, the years, and
              the few lines under their name — and where you find the two links to share.
            </p>
          )}

          {error && <p style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>{error}</p>}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" disabled={submitting} style={primaryBtn}>
              {submitting ? 'Creating…' : app === 'chorus' ? 'Create memorial' : 'Create instance'}
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
