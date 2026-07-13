'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import PlayerMap from '@/components/graph/PlayerMap';
import { UserService, PlayerGamesResponse, GameMapResponse } from '@/services/userService';
import { STR } from '@/lib/strings';
import { collectiveMapUrl, isSpectrum, gameProductName } from '@/lib/games';
import styles from './page.module.css';

function gameLabel(game: { name: string; gameNumber: number | null }) {
  return game.gameNumber != null ? `${game.name} · g${game.gameNumber}` : game.name;
}

// ─── Player history (default mode) ───────────────────────────────────────────

function PlayerHistory({ data, targetUserId, isOwnProfile }: {
  data: PlayerGamesResponse;
  targetUserId: string;
  isOwnProfile: boolean;
}) {
  const displayName = data.user.name || 'Anonymous';

  return (
    <>
      <div className={styles.profileHeader}>
        <div className={styles.avatar}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className={styles.profileName}>{displayName}</h1>
          <p className={styles.profileMeta}>
            {data.games.length} {data.games.length === 1 ? 'game' : 'games'} played
          </p>
        </div>
      </div>

      <div className={styles.divider} />

      {data.games.length > 0 ? (
        <div>
          <h2 className={styles.sectionTitle}>Player History</h2>
          {data.games.map((game) => (
            <div key={game.instanceId} className={styles.activityCard}>
              <div className={styles.gameEyebrow}>{gameProductName(game)}</div>
              <div className={styles.activityTitle}>
                {gameLabel(game)}
                {!game.active && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.55rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    ended
                  </span>
                )}
              </div>
              <div className={styles.activityAxes}>
                {game.joinedAt && <>Joined {new Date(game.joinedAt).toLocaleDateString()} &middot; </>}
                {game.stats.entries} {game.stats.entries === 1 ? 'entry' : 'entries'} across {game.stats.activities} {game.stats.activities === 1 ? STR.map.toLowerCase() : STR.maps.toLowerCase()}
                {game.stats.votesCast > 0 && <> &middot; {game.stats.votesCast} votes cast</>}
                {game.stats.frames > 0 && <> &middot; {game.stats.frames} {game.stats.frames === 1 ? STR.frame.toLowerCase() : STR.frames.toLowerCase()}</>}
                {game.stats.patterns > 0 && <> &middot; {game.stats.patterns} {game.stats.patterns === 1 ? STR.pattern.toLowerCase() : STR.patterns.toLowerCase()}</>}
              </div>
              <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.6rem' }}>
                {isSpectrum(game) ? (
                  // On a Spectrum lives in its own app and has no interView-shaped
                  // personal map — link straight into the room.
                  <a
                    href={collectiveMapUrl(game)}
                    className={styles.footerLink}
                  >
                    Open &rarr;
                  </a>
                ) : (
                  <>
                    <Link
                      href={collectiveMapUrl(game)}
                      className={styles.footerLink}
                    >
                      Collective map &rarr;
                    </Link>
                    <Link
                      href={`/profile/${targetUserId}?game=${game.slug}`}
                      className={styles.footerLink}
                    >
                      {isOwnProfile ? 'Your map' : 'Their map'} &rarr;
                    </Link>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          {isOwnProfile
            ? "You haven't joined any games yet."
            : `${displayName} hasn't joined any games you share.`}
        </div>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId: viewerId, isLoading: authLoading } = useAuth();
  const targetUserId = params.userId as string;
  const game = searchParams.get('game');

  const [games, setGames] = useState<PlayerGamesResponse | null>(null);
  const [gameMap, setGameMap] = useState<GameMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = ''; };
  }, []);

  useEffect(() => {
    if (authLoading || !targetUserId) return;

    async function fetchProfile() {
      setLoading(true);
      setError(null);
      try {
        if (!viewerId) {
          setError('Sign in to view player profiles.');
          return;
        }
        if (game) {
          setGameMap(await UserService.getGameMap(targetUserId, viewerId, game));
        } else {
          setGames(await UserService.getGames(targetUserId, viewerId));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [targetUserId, viewerId, game, authLoading]);

  if (loading || authLoading) {
    return <div className={styles.loading}>Loading profile...</div>;
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.grain} />
        <div className={styles.container}>
          <nav className={styles.nav}>
            <Link href="/" className={styles.wordmark}>
              Holo<span>scopic</span>
            </Link>
            <UserMenu />
          </nav>
          <div style={{ paddingTop: '4rem' }}>
            <div className={styles.errorCard}>
              <div className={styles.errorText}>{error}</div>
              <button onClick={() => router.back()} className={styles.errorLink}>
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isOwnProfile = viewerId === targetUserId;

  // ── Personal map mode (?game=slug) ──
  if (game && gameMap) {
    const displayName = gameMap.user.name || 'Anonymous';
    return (
      <div className={styles.page} style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <div className={styles.grain} />
        <div style={{ flexShrink: 0, padding: '1rem 1.5rem 0.5rem', position: 'relative', zIndex: 10 }}>
          <nav className={styles.nav} style={{ marginBottom: '0.5rem' }}>
            <Link href="/" className={styles.wordmark}>
              Holo<span>scopic</span>
            </Link>
            <div className={styles.navRight}>
              <span className={styles.navLabel}>Player map</span>
              <UserMenu />
            </div>
          </nav>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.85rem', flexWrap: 'wrap' }}>
            <Link href={`/profile/${targetUserId}`} className={styles.breadcrumb} style={{ margin: 0 }}>
              &larr; {displayName}
            </Link>
            {gameMap.instance && (
              <>
                <span className={styles.profileMeta} style={{ margin: 0 }}>
                  in {gameLabel(gameMap.instance)}
                </span>
                <a href={collectiveMapUrl(gameMap.instance)} className={styles.footerLink}>
                  Collective map &rarr;
                </a>
              </>
            )}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, position: 'relative', zIndex: 5 }}>
          <PlayerMap map={gameMap} />
        </div>
      </div>
    );
  }

  // ── Player history mode ──
  if (!games) return null;

  return (
    <div className={styles.page}>
      <div className={styles.grain} />

      <div className={styles.container}>
        <nav className={styles.nav}>
          <Link href="/" className={styles.wordmark}>
            Holo<span>scopic</span>
          </Link>
          <div className={styles.navRight}>
            <span className={styles.navLabel}>Profile</span>
            <UserMenu />
          </div>
        </nav>

        <PlayerHistory data={games} targetUserId={targetUserId} isOwnProfile={isOwnProfile} />

        <footer className={styles.footer}>
          <Link href="/" className={styles.footerLink}>Home</Link>
          <Link href="/dashboard" className={styles.footerLink}>Dashboard</Link>
        </footer>
      </div>
    </div>
  );
}
