'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch, uploadMemorialPhoto } from '@/lib/api';
import { prepareImage } from '@/lib/image';

interface HolonConfig { startingStake: number; nominationCost: number; supportCost: number; algorithmPublishCost: number; sessionHostReward: number; sessionParticipantReward: number; topicQuorumReward: number; algorithmRoyaltyPercent: number; forkRoyaltyDecayPercent: number; forkDepthCap: number; }
interface QuorumConfig { topicSupportThreshold: number; topicWindowHours: number; inquiryMinParticipants: number; frameVoteThreshold: number; algorithmSessionQuorum: number; algorithmProposalWindowHours: number; }
interface OasConfig { startingTokens: number; quorum: number; votesPerUser: number; maxPlayers: number; }
// Chorus — everything the memorial app knows about the person it collects
// memories for. Held on the Instance rather than in the frontend build so a
// new memorial is a config change, not a deploy (apps/chorus/PLAN.md §11).
interface MemorialConfig {
  subjectName: string; shortName: string; subjectPhotoUrl: string; blurb: string; lifespan: string;
  seedRoleTags: string[]; seedExperienceTags: string[];
  allowCustomTags: boolean; audioMaxSeconds: number;
  curatorKey: string; accent: string;
}
// Which app an instance belongs to. This is a stored field on the Instance —
// before it existed the admin had no way to say, so everything created here
// was an interView edition and a memorial could only be made by running
// scripts/seed-memorial.js.
type AppId = 'interview' | 'spectrum' | 'synthesis' | 'chorus';
const APP_LABELS: Record<AppId, string> = {
  interview: 'interView',
  spectrum: 'On a Spectrum',
  synthesis: 'Synthesis',
  chorus: 'Chorus (memorial)',
};

interface InstanceData {
  id: string; name: string; slug: string; app?: AppId; domains: string[];
  gameVersion: string | null; gameNumber: number | null; active: boolean;
  access: { mode: string; inviteCodes: string[] };
  startDate: string | null; endDate: string | null;
  config: {
    mode?: 'normal' | 'explore';
    holons: HolonConfig; quorum: QuorumConfig; oas: OasConfig;
    memorial?: MemorialConfig;
  };
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
  const [app, setApp] = useState<AppId>('interview');
  const [domains, setDomains] = useState('');
  const [gameVersion, setGameVersion] = useState('');
  const [gameNumber, setGameNumber] = useState('');
  const [active, setActive] = useState(true);
  const [accessMode, setAccessMode] = useState<'public' | 'invite'>('public');
  const [inviteCodes, setInviteCodes] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Config fields
  const [mode, setMode] = useState<'normal' | 'explore'>('normal');
  const [holons, setHolons] = useState<HolonConfig | null>(null);
  const [quorum, setQuorum] = useState<QuorumConfig | null>(null);
  const [oas, setOas] = useState<OasConfig | null>(null);
  const [memorial, setMemorial] = useState<MemorialConfig | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which config surface to show is entirely a function of the app: On a
  // Spectrum exposes its room defaults, Chorus its memorial subject, interView
  // the holon/quorum economy. All three read the one stored field rather than
  // sniffing slugs and config blocks the way this page used to.
  const appId: AppId = app || 'interview';
  const isOas = appId === 'spectrum';
  const isMemorial = appId === 'chorus';

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
        setApp(inst.app || 'interview');
        setDomains(inst.domains.join('\n'));
        setGameVersion(inst.gameVersion || '1.0');
        setGameNumber(inst.gameNumber != null ? String(inst.gameNumber) : '');
        setActive(inst.active);
        setAccessMode(inst.access.mode as 'public' | 'invite');
        setInviteCodes((inst.access.inviteCodes || []).join('\n'));
        setStartDate(inst.startDate ? inst.startDate.slice(0, 10) : '');
        setEndDate(inst.endDate ? inst.endDate.slice(0, 10) : '');
        setMode((inst.config.mode as 'normal' | 'explore') || 'normal');
        setHolons(inst.config.holons);
        setQuorum(inst.config.quorum);
        setOas(inst.config.oas);
        setMemorial(inst.config.memorial || null);
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
        name, app,
        domains: domains.split('\n').map(d => d.trim()).filter(Boolean),
        gameVersion, active,
        gameNumber: gameNumber.trim() === '' ? null : Number(gameNumber),
        access: { mode: accessMode, inviteCodes: inviteCodes.split('\n').map(c => c.trim()).filter(Boolean) },
        startDate: startDate || null,
        endDate: endDate || null,
      };
      if (tab === 'config') {
        // On a Spectrum only edits its own room defaults; interView editions
        // edit the holon economy. Send just the relevant slice so neither
        // rewrites the other's untouched values.
        if (isMemorial) {
          // Only the memorial slice — a Chorus instance has no economy to
          // rewrite, and sending holons/quorum would overwrite defaults it
          // never displays.
          if (memorial) body.config = { memorial };
        } else if (isOas) {
          if (oas) body.config = { oas };
        } else if (holons && quorum) {
          body.config = { mode, holons, quorum };
        }
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
            <FieldGroup label="App" hint="which game this instance belongs to — decides the Config tab">
              <select value={app} onChange={e => setApp(e.target.value as AppId)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {(Object.keys(APP_LABELS) as AppId[]).map(a => (
                  <option key={a} value={a}>{APP_LABELS[a]}</option>
                ))}
              </select>
            </FieldGroup>
            {appId === 'chorus' && (
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-light)', margin: '-0.5rem 0 0', maxWidth: '34rem' }}>
                This memorial is live at <code>/c/{slug}</code> on the Chorus app. Its subject, photo
                and starting vocabulary are on the Config tab.
              </p>
            )}
            {/* Edition numbering is interView's alone — a memorial or a
                Synthesis idea holding a gameNumber can be picked as the
                platform's default instance and start answering unrelated
                traffic. */}
            {appId === 'interview' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <FieldGroup label="Game number" hint="Edition number — drives /interview/g<N> URLs and the Edition badge">
                  <input type="number" min={1} value={gameNumber} onChange={e => setGameNumber(e.target.value)} style={inputStyle} placeholder="1" />
                </FieldGroup>
                <FieldGroup label="Game version" hint="Version shown to players in interView">
                  <input type="text" value={gameVersion} onChange={e => setGameVersion(e.target.value)} style={inputStyle} placeholder="1.0" />
                </FieldGroup>
              </div>
            )}
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

        {tab === 'config' && isMemorial && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <MemorialFields
              memorial={memorial}
              setMemorial={setMemorial}
              slug={instance.slug}
              instanceId={instance.id}
            />
          </div>
        )}

        {tab === 'config' && !isMemorial && holons && quorum && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {isOas ? (
              oas && (
                <Section title="On a Spectrum — Room Defaults">
                  <p style={{ fontSize: '0.75rem', color: 'var(--ink-light)', margin: '0 0 0.75rem', maxWidth: '32rem' }}>
                    Defaults for every new game room. A room only falls back to these when its
                    creation request doesn&apos;t set the value itself. On a Spectrum runs its own
                    per-room economy — the holon and quorum settings used by interView editions
                    don&apos;t apply here.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(13rem, 1fr))', gap: '0.75rem' }}>
                    {(Object.keys(oas) as (keyof OasConfig)[]).map(key => (
                      <FieldGroup key={key} label={key.replace(/([A-Z])/g, ' $1').toLowerCase()}>
                        <input type="number" value={oas[key]}
                          onChange={e => setOas(o => o && { ...o, [key]: Number(e.target.value) })}
                          style={inputStyle} />
                      </FieldGroup>
                    ))}
                  </div>
                </Section>
              )
            ) : (
              <>
                <Section title="Economy Mode">
                  <FieldGroup label="mode">
                    <select value={mode} onChange={e => setMode(e.target.value as 'normal' | 'explore')} style={inputStyle}>
                      <option value="normal">Normal — holon economy on</option>
                      <option value="explore">Explore — free, no economy, instant create</option>
                    </select>
                  </FieldGroup>
                  {mode === 'explore' && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--ink-light)', margin: '0.5rem 0 0', maxWidth: '32rem' }}>
                      Explore turns the economy off: no costs, no rewards, balances show ∞, and topics/sessions open instantly.
                      The holon and quorum values below are kept but bypassed, so switching back to Normal restores them exactly.
                    </p>
                  )}
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
              </>
            )}
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

const toLines = (v: string) => v.split('\n').map(s => s.trim()).filter(Boolean);

// A list of words edited as one-per-line text.
//
// THE TEXTAREA OWNS ITS OWN TEXT while it is being edited. Deriving the value
// from the parsed array instead — `value={tags.join('\n')}` — is what made the
// Enter key appear to do nothing: pressing it produces a trailing empty line,
// `toLines` drops it, the array comes back identical, and the re-render puts
// the text back exactly as it was. The same round trip ate a leading space the
// moment you typed it.
//
// So `raw` is what you typed and the parsed array is what leaves. They are only
// re-synced when the parent's value stops matching what the text represents —
// a fresh load — which is never true of your own keystrokes.
function LinesField({
  label, value, onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [raw, setRaw] = useState(() => (value || []).join('\n'));

  useEffect(() => {
    const incoming = (value || []).join('\n');
    setRaw(current => (toLines(current).join('\n') === incoming ? current : incoming));
  }, [value]);

  return (
    <FieldGroup label={label}>
      <textarea
        value={raw}
        rows={8}
        onChange={e => {
          setRaw(e.target.value);
          onChange(toLines(e.target.value));
        }}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
      />
    </FieldGroup>
  );
}

// The subject photo: choose a file, or paste a URL if the photo already lives
// somewhere. Both write the same one field, and neither saves anything on its
// own — Save is still Save.
//
// A chosen file is downscaled in the browser (lib/image.ts) and then posted to
// /api/memorial-photo, which puts it in Vercel Blob. Pasting a URL used to be
// the only way, which meant the person setting up a memorial had to go and find
// image hosting first, on the day they were least able to.
function PhotoField({
  url, onChange, instanceId, slug,
}: {
  url: string;
  onChange: (url: string) => void;
  instanceId: string;
  slug: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await prepareImage(file);
      onChange(await uploadMemorialPhoto(blob, { instanceId, slug, filename }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-light)' }}>
        photo
      </span>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? (
          <img
            src={url}
            alt=""
            style={{
              width: 72, height: 72, objectFit: 'cover', borderRadius: 6,
              border: '1px solid var(--border)', flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 72, height: 72, borderRadius: 6, flexShrink: 0,
              border: '1px dashed var(--border)', background: '#fff',
            }}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label
              style={{
                ...primaryBtn,
                display: 'inline-block',
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.5 : 1,
              }}
            >
              {busy ? 'Uploading…' : url ? 'Replace photo' : 'Choose a photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }}
                style={{ display: 'none' }}
              />
            </label>
            {url && !busy && (
              <button
                type="button"
                onClick={() => onChange('')}
                style={{ ...primaryBtn, background: 'transparent', color: 'var(--ink-light)', border: '1px solid var(--border)' }}
              >
                Remove
              </button>
            )}
          </div>

          <input
            value={url}
            placeholder="…or paste a URL"
            onChange={e => onChange(e.target.value)}
            style={{ ...inputStyle, fontSize: '0.75rem' }}
          />
        </div>
      </div>

      {error && (
        <p style={{ fontSize: '0.75rem', color: 'var(--accent)', margin: 0 }}>{error}</p>
      )}
    </div>
  );
}

// ── Chorus memorial ─────────────────────────────────────────────────────────
// Where the memorial and curate links point. One deployed Chorus frontend
// serves every memorial, addressed by /c/<slug> — so this is a single value,
// not one per memorial.
const CHORUS_URL = process.env.NEXT_PUBLIC_CHORUS_URL || 'https://chorus.holoscopic.io';

// The whole of what makes a Chorus instance a memorial for a particular
// person. Editing these is how a new memorial gets its subject — no deploy, no
// migration, because the frontend reads every one of them from GET /config at
// request time (apps/chorus/PLAN.md §11, D11).
function MemorialFields({
  memorial, setMemorial, slug, instanceId,
}: {
  memorial: MemorialConfig | null;
  setMemorial: (fn: (m: MemorialConfig | null) => MemorialConfig | null) => void;
  slug: string;
  /** Proves to /api/memorial-photo that the uploader is an admin. */
  instanceId: string;
}) {
  // Creating an instance with app &ldquo;Chorus&rdquo; provisions all of this,
  // so an empty block means the instance was switched to Chorus by hand and
  // saved without a reload, or predates that provisioning.
  if (!memorial) {
    return (
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-light)', maxWidth: '32rem' }}>
        This instance has no memorial config yet. Set <strong>App</strong> to Chorus on the Basic
        tab, save, and reload — that mints the curator key and plants the starting vocabulary.
      </p>
    );
  }

  const set = <K extends keyof MemorialConfig>(key: K, value: MemorialConfig[K]) =>
    setMemorial(m => m && { ...m, [key]: value });


  return (
    <>
      <Section title="Who this memorial is for">
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-light)', margin: '0 0 0.75rem', maxWidth: '32rem' }}>
          Every field here is read live by the Chorus frontend, so changing a name or photo takes
          effect on the next page load. Nothing about the subject is baked into a build.
        </p>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <FieldGroup label="subject name" hint="the headline, and what a shared link says">
            <input value={memorial.subjectName} placeholder="Ellen Vance"
              onChange={e => set('subjectName', e.target.value)} style={inputStyle} />
          </FieldGroup>
          <FieldGroup
            label="short name"
            hint={`what to call ${memorial.subjectName || 'her'} in the questions — blank uses “${(memorial.subjectName || '').trim().split(/\s+/)[0] || 'the first word'}”`}
          >
            <input
              value={memorial.shortName || ''}
              placeholder={(memorial.subjectName || '').trim().split(/\s+/)[0] || 'Ellen'}
              onChange={e => set('shortName', e.target.value)}
              style={inputStyle}
            />
          </FieldGroup>
          <PhotoField
            url={memorial.subjectPhotoUrl}
            onChange={url => set('subjectPhotoUrl', url)}
            instanceId={instanceId}
            slug={slug}
          />
          <FieldGroup label="lifespan (free text, optional)">
            <input value={memorial.lifespan} placeholder="1941 – 2024"
              onChange={e => set('lifespan', e.target.value)} style={inputStyle} />
          </FieldGroup>
          <FieldGroup label="blurb — the invitation under the name">
            <textarea value={memorial.blurb} rows={3}
              placeholder="If you knew her, tell us something we would not otherwise know."
              onChange={e => set('blurb', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
          </FieldGroup>
        </div>
      </Section>

      <Section title="Starting vocabulary">
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-light)', margin: '0 0 0.75rem', maxWidth: '32rem' }}>
          {/* Every space that touches a tag or an expression is written as
              {' '} on purpose. Left as plain source whitespace it disappears
              from the rendered text here — "rolefills both", "Ellen Vancewas". */}
          One per line. These answer the two questions the compose form asks —{' '}
          <em>role</em>{' '}answers &ldquo;Who was{' '}
          {memorial.shortName || (memorial.subjectName || '').trim().split(/\s+/)[0] || 'she'}{' '}
          in this story?&rdquo; and{' '}
          <em>experience</em>{' '}answers &ldquo;What was this an experience of?&rdquo;. The most-used
          few appear on the form itself, so put the likeliest answers here. Contributors add their
          own words from here, so this only has to be good enough to show people the shape of an
          answer. Adding a line here makes it appear in the picker immediately; removing one leaves
          any memory already using it untouched.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))', gap: '0.75rem' }}>
          <LinesField
            label="role tags"
            value={memorial.seedRoleTags}
            onChange={v => set('seedRoleTags', v)}
          />
          <LinesField
            label="experience tags"
            value={memorial.seedExperienceTags}
            onChange={v => set('seedExperienceTags', v)}
          />
        </div>
      </Section>

      <Section title="Behaviour">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(13rem, 1fr))', gap: '0.75rem' }}>
          <FieldGroup label="let contributors add words">
            <select value={memorial.allowCustomTags ? 'yes' : 'no'}
              onChange={e => set('allowCustomTags', e.target.value === 'yes')} style={inputStyle}>
              <option value="yes">Yes — the vocabulary grows</option>
              <option value="no">No — the seeded words only</option>
            </select>
          </FieldGroup>
          <FieldGroup label="recording limit (seconds)">
            <input type="number" value={memorial.audioMaxSeconds}
              onChange={e => set('audioMaxSeconds', Number(e.target.value))} style={inputStyle} />
          </FieldGroup>
          <FieldGroup label="accent colour">
            <input value={memorial.accent} placeholder="#C97B1E"
              onChange={e => set('accent', e.target.value)} style={inputStyle} />
          </FieldGroup>
        </div>
      </Section>

      <Section title="Links">
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-light)', margin: '0 0 0.75rem', maxWidth: '32rem' }}>
          The first is the link you share. The second is the only credential for moderating this
          memorial — send it to whoever is looking after it; anyone holding it can hide and restore
          memories, and rotating it locks out everyone who has the old one.
        </p>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <FieldGroup label="memorial url">
            <input readOnly value={`${CHORUS_URL}/c/${slug}`}
              onFocus={e => e.currentTarget.select()}
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }} />
          </FieldGroup>
          <FieldGroup label="curate url">
            <input readOnly
              value={memorial.curatorKey
                ? `${CHORUS_URL}/c/${slug}/curate?k=${memorial.curatorKey}`
                : '(not set — save with App: Chorus and reload)'}
              onFocus={e => e.currentTarget.select()}
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }} />
          </FieldGroup>
        </div>
      </Section>
    </>
  );
}
