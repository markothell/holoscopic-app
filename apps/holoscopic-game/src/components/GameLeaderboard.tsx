'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useInstance } from '@/contexts/InstanceContext';
import GameNav from '@/components/GameNav';
import { apiFetch } from '@/lib/api';
import { HOLON_SYMBOL, STR } from '@/lib/strings';
import { mono, eyebrowCss } from '@/lib/ui';

type Row = { rank: number; userId: string; name: string; earned: number; events: number };

/** Edition lifecycle from instance dates: live → final day → ended. */
function editionStatus(instance: { startDate: string | null; endDate: string | null } | null, active = true) {
  if (!active) return { label: 'Ended', color: 'var(--text-muted)' };
  if (instance?.endDate) {
    const end = new Date(instance.endDate).getTime();
    if (Date.now() > end) return { label: 'Ended', color: 'var(--text-muted)' };
    if (end - Date.now() < 24 * 3600 * 1000) return { label: 'Final day', color: 'var(--accent)' };
  }
  return { label: 'Live', color: 'var(--accent-emerald)' };
}

export default function GameLeaderboard() {
  const { userId } = useAuth();
  const { instance } = useInstance();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/holons/leaderboard')
      .then(d => setRows(d.leaderboard ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const status = editionStatus(instance, (instance as any)?.active ?? true);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <GameNav active="leaderboard" />

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-cormorant), serif' }}>
            Standings
          </h1>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: 'var(--text-2xs)', fontFamily: mono, letterSpacing: '0.1em', textTransform: 'uppercase', color: status.color }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: status.color, display: 'inline-block' }} />
            Edition #{instance?.gameNumber ?? 1} · {status.label}
          </span>
        </div>
        <p style={{ ...eyebrowCss, marginBottom: '2.5rem' }}>
          Lifetime {STR.holons.toLowerCase()} earned through connection — attribution, frames adopted,
          seeds, royalties, convening. Spending never lowers your standing.
        </p>

        {loading && (
          <p style={{ fontSize: 'var(--text-xs)', fontFamily: mono, color: 'var(--text-muted)' }}>loading…</p>
        )}
        {!loading && rows.length === 0 && (
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
            No earnings yet — standings appear as {STR.maps.toLowerCase()} settle and {STR.frames.toLowerCase()} get used.
          </p>
        )}

        <div>
          {rows.map(r => {
            const isMe = r.userId === userId;
            return (
              <div key={r.userId} style={{
                display: 'flex', alignItems: 'baseline', gap: '1rem',
                padding: '0.7rem 0.85rem', borderBottom: '1px solid var(--border-subtle)',
                background: isMe ? 'rgba(200,59,80,0.05)' : 'transparent',
                borderRadius: isMe ? 8 : 0,
              }}>
                <span style={{ width: 28, fontSize: 'var(--text-sm)', fontFamily: mono, color: r.rank <= 3 ? 'var(--accent)' : 'var(--text-muted)', fontWeight: r.rank <= 3 ? 700 : 400 }}>
                  {r.rank}
                </span>
                <span style={{ flex: 1, fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: isMe ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}{isMe ? ' — you' : ''}
                </span>
                <span style={{ fontSize: 'var(--text-2xs)', fontFamily: mono, color: 'var(--text-muted)' }}>
                  {r.events} {r.events === 1 ? 'event' : 'events'}
                </span>
                <span style={{ fontSize: 'var(--text-base)', fontFamily: mono, fontWeight: 600, color: 'var(--accent)' }}>
                  {HOLON_SYMBOL} {r.earned}
                </span>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
