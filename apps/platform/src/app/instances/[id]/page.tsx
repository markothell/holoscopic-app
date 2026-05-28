'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';

interface HolonConfig { startingStake: number; nominationCost: number; supportCost: number; algorithmPublishCost: number; sessionHostReward: number; sessionParticipantReward: number; topicQuorumReward: number; algorithmRoyaltyPercent: number; forkRoyaltyDecayPercent: number; forkDepthCap: number; }
interface QuorumConfig { topicSupportThreshold: number; topicWindowHours: number; inquiryMinParticipants: number; frameVoteThreshold: number; algorithmSessionQuorum: number; algorithmProposalWindowHours: number; }
interface InstanceData {
  id: string; name: string; slug: string; domains: string[];
  gameType: string; active: boolean;
  access: { mode: string; inviteCodes: string[] };
  startDate: string | null; endDate: string | null;
  config: { topicsActivityId: string | null; holons: HolonConfig; quorum: QuorumConfig };
}

type Tab = 'basic' | 'config';

export default function EditInstancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [instance, setInstance] = useState<InstanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('basic');

  // Basic fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [domains, setDomains] = useState('');
  const [gameType, setGameType] = useState('');
  const [active, setActive] = useState(true);
  const [accessMode, setAccessMode] = useState<'public' | 'invite'>('public');
  const [inviteCodes, setInviteCodes] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Config fields
  const [holons, setHolons] = useState<HolonConfig | null>(null);
  const [quorum, setQuorum] = useState<QuorumConfig | null>(null);
  const [topicsActivityId, setTopicsActivityId] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    apiFetch(`/instances/${id}`, { userId: user.id })
      .then(d => {
        const inst: InstanceData = d.instance;
        setInstance(inst);
        setName(inst.name);
        setSlug(inst.slug);
        setDomains(inst.domains.join('\n'));
        setGameType(inst.gameType);
        setActive(inst.active);
        setAccessMode(inst.access.mode as 'public' | 'invite');
        setInviteCodes((inst.access.inviteCodes || []).join('\n'));
        setStartDate(inst.startDate ? inst.startDate.slice(0, 10) : '');
        setEndDate(inst.endDate ? inst.endDate.slice(0, 10) : '');
        setHolons(inst.config.holons);
        setQuorum(inst.config.quorum);
        setTopicsActivityId(inst.config.topicsActivityId || '');
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, id]);

  async function save() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name, domains: domains.split('\n').map(d => d.trim()).filter(Boolean),
        gameType, active,
        access: { mode: accessMode, inviteCodes: inviteCodes.split('\n').map(c => c.trim()).filter(Boolean) },
        startDate: startDate || null,
        endDate: endDate || null,
      };
      if (tab === 'config' && holons && quorum) {
        body.config = { holons, quorum, topicsActivityId: topicsActivityId || null };
      }
      await apiFetch(`/instances/${id}`, { method: 'PUT', userId: user.id, body: JSON.stringify(body) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !user || loading) return null;
  if (!instance) return <p style={{ padding: '2rem', color: 'var(--accent)' }}>{error || 'Instance not found'}</p>;

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link href="/instances" style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-light)' }}>← Instances</Link>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{instance.name}</span>
            <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--ink-light)' }}>{instance.slug}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {error && <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>{error}</span>}
            {saved && <span style={{ fontSize: '0.75rem', color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>Saved ✓</span>}
            <button onClick={save} disabled={saving} style={primaryBtn}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem' }}>
        <nav style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
          {(['basic', 'config'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '0.6rem 1rem', border: 'none', background: 'none',
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: 'pointer',
              color: tab === t ? 'var(--ink)' : 'var(--ink-light)',
              borderBottom: tab === t ? '2px solid var(--ink)' : '2px solid transparent',
              marginBottom: -1,
            }}>{t}</button>
          ))}
        </nav>

        {tab === 'basic' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <FieldGroup label="Name">
              <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
            </FieldGroup>
            <FieldGroup label="Slug" hint="(changing slug does not update domains)">
              <input type="text" value={slug} readOnly style={{ ...inputStyle, color: 'var(--ink-light)', cursor: 'not-allowed' }} />
            </FieldGroup>
            <FieldGroup label="Game type">
              <input type="text" value={gameType} onChange={e => setGameType(e.target.value)} style={inputStyle} />
            </FieldGroup>
            <FieldGroup label="Domains" hint="One per line">
              <textarea rows={3} value={domains} onChange={e => setDomains(e.target.value)}
                style={{ ...inputStyle, resize: 'vertical' }} />
            </FieldGroup>
            <FieldGroup label="Access">
              <select value={accessMode} onChange={e => setAccessMode(e.target.value as 'public' | 'invite')}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="public">Public</option>
                <option value="invite">Invite only</option>
              </select>
            </FieldGroup>
            {accessMode === 'invite' && (
              <FieldGroup label="Invite codes" hint="One per line">
                <textarea rows={3} value={inviteCodes} onChange={e => setInviteCodes(e.target.value)}
                  style={{ ...inputStyle, resize: 'vertical' }} />
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
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
              <span style={{ fontSize: '0.8rem', color: 'var(--ink-mid)' }}>Active</span>
            </label>
          </div>
        )}

        {tab === 'config' && holons && quorum && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <Section title="Tier Links">
              <FieldGroup label="Topics — Activity ID">
                <input type="text" value={topicsActivityId} onChange={e => setTopicsActivityId(e.target.value)}
                  style={inputStyle} placeholder="Paste activity ID" />
              </FieldGroup>
            </Section>

            <Section title="Holon Amounts">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(13rem, 1fr))', gap: '0.75rem' }}>
                {(Object.keys(holons) as (keyof HolonConfig)[]).map(key => (
                  <FieldGroup key={key} label={key.replace(/([A-Z])/g, ' $1').toLowerCase()}>
                    <input type="number" value={holons[key]}
                      onChange={e => setHolons(h => h && { ...h, [key]: Number(e.target.value) })}
                      style={inputStyle} />
                  </FieldGroup>
                ))}
              </div>
            </Section>

            <Section title="Quorum Settings">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(13rem, 1fr))', gap: '0.75rem' }}>
                {(Object.keys(quorum) as (keyof QuorumConfig)[]).map(key => (
                  <FieldGroup key={key} label={key.replace(/([A-Z])/g, ' $1').toLowerCase()}>
                    <input type="number" value={quorum[key]}
                      onChange={e => setQuorum(q => q && { ...q, [key]: Number(e.target.value) })}
                      style={inputStyle} />
                  </FieldGroup>
                ))}
              </div>
            </Section>
          </div>
        )}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-light)', marginBottom: '0.75rem' }}>{title}</h3>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.55rem 0.75rem',
  border: '1px solid var(--border)', borderRadius: 6,
  background: '#fff', color: 'var(--ink)', outline: 'none', fontSize: '0.875rem',
};

const primaryBtn: React.CSSProperties = {
  padding: '0.5rem 1rem', borderRadius: 6, border: 'none',
  background: 'var(--ink)', color: '#fff', fontWeight: 600, fontSize: '0.8rem',
};
