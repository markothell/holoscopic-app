'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AdminNav from '@/components/AdminNav';
import { apiFetch } from '@/lib/api';

// Site traffic. How many people arrived at each app, and which links on the
// homepage they took.
//
// Reads GET /api/traffic/summary, which is served from the permanent daily
// rollup rather than from raw events — so a 90-day range is three queries'
// worth of counters, not a scan over every page view ever recorded, and it
// keeps answering after the raw tier's 30-day TTL has collected the detail.
//
// This is NOT the same thing as the activity stats on an instance page. Those
// count participation inside a map — who entered, commented, voted. This counts
// arrival.

const APP_LABELS: Record<string, string> = {
  site: 'holoscopic.io',
  interview: 'interView',
  'map-sequence': 'Map + Sequence',
  spectrum: 'On a Spectrum',
  synthesis: 'Synthesis',
  chorus: 'Chorus',
  threshold: 'Threshold',
};

// Categorical slots in FIXED order — colour follows the app, never its rank, so
// a quiet week cannot repaint the chart and make two screenshots incomparable.
// Validated as a set against the white card surface: worst pair under simulated
// deuteranopia is interview/spectrum at ΔE2000 9.4, worst under normal vision is
// chorus/map-sequence at 20.0. Four of them sit under 3:1 against white, which
// is why every bar in here carries a visible label and every figure also exists
// as a table row — that is the relief the contrast warning requires, not a
// nicety.
//
// ADDING ONE means re-running that check, not eyeballing a gap in the hue
// wheel. Threshold's violet was picked because it leaves both worst pairs
// exactly where they were; the obvious blue-violets collapse against `site`
// under deuteranopia (ΔE 2.2–3.9) while looking perfectly distinct to me.
const APP_COLORS: Record<string, string> = {
  site: '#2a78d6',
  interview: '#eb6834',
  chorus: '#1baf7a',
  spectrum: '#eda100',
  synthesis: '#e87ba4',
  'map-sequence': '#008300',
  threshold: '#a349a4',
};

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

interface Ranked { key: string; views: number }
interface AppRow { app: string; views: number; visitors: number }
interface Summary {
  from: string;
  to: string;
  apps: AppRow[];
  totals: { views: number; visitors: number };
  series: Array<Record<string, string | number>>;
  paths: Record<string, Ranked[]>;
  clicks: Record<string, Ranked[]>;
}

const mono: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.05em',
};
const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '1.25rem',
};
const sectionTitle: React.CSSProperties = {
  fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.15rem',
};
const sectionNote: React.CSSProperties = {
  ...mono, color: 'var(--ink-light)', marginBottom: '1rem',
};

function dayKey(offsetDays = 0) {
  return new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);
}

function shortDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

export default function TrafficPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/traffic/summary?from=${dayKey(days - 1)}&to=${dayKey(0)}`)
      .then(d => setData(d.traffic))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { if (user) load(); }, [user, load]);

  if (isLoading || !user) return null;

  const totalViews = data?.totals.views ?? 0;
  const totalVisitors = data?.totals.visitors ?? 0;
  // Clicks live under the app whose page carried the link. Today that is only
  // the homepage, which is the one place click tracking is switched on.
  const homepageClicks = data?.clicks?.site ?? [];
  const totalClicks = homepageClicks.reduce((n, c) => n + c.views, 0);

  return (
    <div style={{ minHeight: '100vh' }}>
      <AdminNav />

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Filters in one row above everything they affect. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Traffic</h1>
            {data && (
              <p style={{ ...mono, color: 'var(--ink-light)', marginTop: '0.2rem' }}>
                {data.from} → {data.to}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 3 }}>
            {RANGES.map(r => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                aria-pressed={days === r.days}
                style={{
                  ...mono, border: 'none', borderRadius: 4, padding: '0.35rem 0.7rem',
                  background: days === r.days ? 'var(--ink)' : 'transparent',
                  color: days === r.days ? '#fff' : 'var(--ink-light)',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading && <p style={{ ...mono, color: 'var(--ink-light)' }}>Loading…</p>}
        {error && <p style={{ ...mono, color: 'var(--accent)' }}>{error}</p>}

        {!loading && !error && data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Three numbers, no chart. A total over a chosen range is a single
                value — drawing it as a one-bar chart would be decoration. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
              <Stat label="Visits" value={totalViews} note="pages opened" />
              <Stat label="People" value={totalVisitors} note="distinct, counted per day" />
              <Stat label="Homepage clicks" value={totalClicks} note="links taken" />
            </div>

            <DailyChart series={data.series} />

            <AppTable rows={data.apps} total={totalViews} />

            <ClickTable clicks={homepageClicks} total={totalClicks} />

            <PathTables paths={data.paths} />
          </div>
        )}
      </main>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div style={card}>
      <div style={{ ...mono, color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1.1, marginTop: '0.4rem' }}>
        {value.toLocaleString()}
      </div>
      <div style={{ ...mono, color: 'var(--ink-light)', marginTop: '0.3rem' }}>{note}</div>
    </div>
  );
}

/**
 * Views per day, every app summed.
 *
 * ONE series on purpose. Six near-zero lines answer "which app" worse than the
 * table below it does, and stacking them would make the shape of the whole —
 * the only thing this chart is for — harder to read rather than easier. One
 * series also means no legend is needed: the heading names it.
 */
function DailyChart({ series }: { series: Array<Record<string, string | number>> }) {
  const rows = series.map(row => {
    const day = String(row.day);
    const views = Object.entries(row)
      .filter(([k]) => k !== 'day')
      .reduce((n, [, v]) => n + Number(v || 0), 0);
    return { day, views };
  });

  if (!rows.length) {
    return (
      <div style={card}>
        <h2 style={sectionTitle}>Visits per day</h2>
        <p style={sectionNote}>Nothing recorded in this range yet.</p>
      </div>
    );
  }

  const peak = Math.max(...rows.map(r => r.views), 1);
  const peakDay = rows.find(r => r.views === peak)?.day;
  const lastDay = rows[rows.length - 1]?.day;

  return (
    <div style={card}>
      <h2 style={sectionTitle}>Visits per day</h2>
      <p style={sectionNote}>All apps together. Hover a bar for its day.</p>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140 }}>
        {rows.map(r => {
          // Selective direct labels: the peak and the most recent day, never a
          // number on every bar.
          const labelled = r.day === peakDay || r.day === lastDay;
          return (
            <div
              key={r.day}
              title={`${shortDay(r.day)} — ${r.views} ${r.views === 1 ? 'visit' : 'visits'}`}
              style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}
            >
              {labelled && (
                <span style={{ ...mono, color: 'var(--ink-mid)', marginBottom: 3 }}>{r.views}</span>
              )}
              <div
                style={{
                  width: '100%',
                  // Anchored to the baseline with a rounded data-end. A zero
                  // day keeps a 2px sliver so the axis stays legible as a row
                  // of days rather than disappearing into gaps.
                  height: `${Math.max(2, (r.views / peak) * 100)}%`,
                  background: APP_COLORS.site,
                  borderRadius: '4px 4px 0 0',
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', ...mono, color: 'var(--ink-light)' }}>
        <span>{shortDay(rows[0].day)}</span>
        <span>{shortDay(rows[rows.length - 1].day)}</span>
      </div>
    </div>
  );
}

/**
 * Per-app arrival. A table with a bar in a cell rather than a bar chart with a
 * table underneath — the numbers are the answer, and the bar is there to make
 * the comparison instant. That also discharges the palette's contrast warning:
 * every colour is beside its own label and its own figure.
 */
function AppTable({ rows, total }: { rows: AppRow[]; total: number }) {
  if (!rows.length) {
    return (
      <div style={card}>
        <h2 style={sectionTitle}>By app</h2>
        <p style={sectionNote}>Nothing recorded in this range yet.</p>
      </div>
    );
  }
  const peak = Math.max(...rows.map(r => r.views), 1);

  return (
    <div style={card}>
      <h2 style={sectionTitle}>By app</h2>
      <p style={sectionNote}>
        People are counted once per app per day — the same person on two apps is one visitor to each.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['App', '', 'Visits', 'People', 'Share'].map((h, i) => (
              <th key={h + i} style={{ ...mono, textAlign: i >= 2 ? 'right' : 'left', color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 400, padding: '0 0.5rem 0.5rem' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.app} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                  background: APP_COLORS[r.app] || 'var(--ink-light)', marginRight: 8,
                }} />
                {APP_LABELS[r.app] || r.app}
              </td>
              <td style={{ padding: '0.6rem 0.5rem', width: '45%' }}>
                <div style={{ background: 'var(--bg)', borderRadius: 4, height: 10 }}>
                  <div style={{
                    width: `${(r.views / peak) * 100}%`,
                    height: '100%',
                    background: APP_COLORS[r.app] || 'var(--ink-light)',
                    borderRadius: 4,
                  }} />
                </div>
              </td>
              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {r.views.toLocaleString()}
              </td>
              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-mid)' }}>
                {r.visitors.toLocaleString()}
              </td>
              <td style={{ ...mono, padding: '0.6rem 0.5rem', textAlign: 'right', color: 'var(--ink-light)' }}>
                {total ? `${Math.round((r.views / total) * 100)}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Which homepage links people actually take, busiest first. */
function ClickTable({ clicks, total }: { clicks: Ranked[]; total: number }) {
  return (
    <div style={card}>
      <h2 style={sectionTitle}>Homepage links</h2>
      <p style={sectionNote}>
        Where people go from holoscopic.io. An outbound link is counted by its host, never its full URL.
      </p>
      {clicks.length === 0 ? (
        <p style={{ ...mono, color: 'var(--ink-light)' }}>No clicks recorded in this range yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {clicks.map(c => (
              <tr key={c.key} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '0.55rem 0.5rem', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                  {c.key}
                </td>
                <td style={{ padding: '0.55rem 0.5rem', width: '40%' }}>
                  <div style={{ background: 'var(--bg)', borderRadius: 4, height: 8 }}>
                    <div style={{
                      width: `${total ? (c.views / Math.max(...clicks.map(x => x.views))) * 100 : 0}%`,
                      height: '100%', background: APP_COLORS.site, borderRadius: 4,
                    }} />
                  </div>
                </td>
                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, width: 60 }}>
                  {c.views.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The busiest pages inside each app. */
function PathTables({ paths }: { paths: Record<string, Ranked[]> }) {
  const apps = Object.keys(paths).filter(a => paths[a]?.length);
  if (!apps.length) return null;

  return (
    <div style={card}>
      <h2 style={sectionTitle}>Busiest pages</h2>
      <p style={sectionNote}>Query strings are stripped before anything is stored.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
        {apps.map(app => (
          <div key={app}>
            <div style={{ ...mono, color: 'var(--ink-mid)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
              <span style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                background: APP_COLORS[app] || 'var(--ink-light)', marginRight: 8,
              }} />
              {APP_LABELS[app] || app}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {paths[app].slice(0, 10).map(p => (
                  <tr key={p.key} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.4rem 0', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                      {p.key}
                    </td>
                    <td style={{ padding: '0.4rem 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, width: 48 }}>
                      {p.views.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
