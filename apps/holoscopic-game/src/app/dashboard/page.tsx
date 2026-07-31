'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sequence } from '@/models/Sequence';
import { HoloscopicActivity } from '@/models/Activity';
import { SequenceService } from '@/services/sequenceService';
import { ActivityService } from '@/services/activityService';
import { InstanceService, JoinedEdition, editionLabel } from '@/services/instanceService';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';
import {
  gameApp, gameEntryUrl, gameProductName, isExternalGame, SPECTRUM_URL, type GameApp,
} from '@/lib/games';
import { ActivityTypeIcon, getActivityTypeLabel } from '@hs/activities';
import styles from './page.module.css';

type TabType = 'games' | 'activities' | 'sequences';

// The landers on this site, one per game. Shown for the games a user has not
// joined, so the Games tab always answers "what could I do next".
//
// These point at the LANDER where one exists — /chorus explains what a memorial
// is before handing off, which is the right first step for someone who has
// never seen one. On a Spectrum has no lander on this site, so it goes straight
// to its own domain, exactly as the homepage card does.
const ALL_GAMES: { app: GameApp; title: string; desc: string; href: string }[] = [
  { app: 'chorus', title: 'Chorus', desc: 'connecting stories and voices', href: '/chorus' },
  { app: 'synthesis', title: 'Synthesis', desc: 'generating collective thought', href: '/synthesis' },
  { app: 'spectrum', title: 'On a Spectrum', desc: 'revealing nuance', href: SPECTRUM_URL },
  { app: 'interview', title: 'interView', desc: 'conversations that learn', href: '/interview' },
];
type SequenceFilterType = 'enrolled' | 'invitations' | 'open';
type ActivityFilterType = 'open' | 'completed';

export default function DashboardPage() {
  const router = useRouter();
  const { userId, isLoading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('games');
  const [sequenceFilter, setSequenceFilter] = useState<SequenceFilterType>('enrolled');
  const [activityFilter, setActivityFilter] = useState<ActivityFilterType>('open');

  const [editions, setEditions] = useState<JoinedEdition[]>([]);
  const [enrolledSequences, setEnrolledSequences] = useState<Sequence[]>([]);
  const [publicSequences, setPublicSequences] = useState<Sequence[]>([]);
  const [invitedSequences, setInvitedSequences] = useState<Sequence[]>([]);
  const [standaloneActivities, setStandaloneActivities] = useState<HoloscopicActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = original; };
  }, []);

  useEffect(() => {
    if (!userId) return;

    const loadUserData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Every game this user has joined, in any app — fails soft so the rest
        // of the dashboard still loads if the endpoint errors.
        try {
          setEditions(await InstanceService.getMine(userId));
        } catch (e) {
          console.error('Error loading joined games:', e);
          setEditions([]);
        }

        const enrolledData = await SequenceService.getUserSequences(userId);
        setEnrolledSequences(enrolledData);

        const publicData = await SequenceService.getPublicSequences();
        const enrolledIds = enrolledData.map(s => s.id);
        const notEnrolledPublic = publicData.filter(s => !enrolledIds.includes(s.id));
        setPublicSequences(notEnrolledPublic);

        // Scoped server-side. This used to pull EVERY sequence on the platform
        // — each with its full invitedEmails list — and filter here for the
        // caller's own address, which handed every private sequence's guest
        // list to anyone who opened this page.
        try {
          setInvitedSequences(await SequenceService.getInvitations(userId));
        } catch (e) {
          console.error('Error loading invitations:', e);
          setInvitedSequences([]);
        }

        const allActivities = await ActivityService.getUserActivities(userId);
        const sequenceActivityIds = enrolledData.flatMap(seq =>
          seq.activities.map(a => a.activityId)
        );
        const standalone = allActivities.filter(
          activity => !sequenceActivityIds.includes(activity.id)
        );
        setStandaloneActivities(standalone);
      } catch (err) {
        setError('Failed to load dashboard data.');
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [userId]);

  const getSequenceStats = (sequence: Sequence) => {
    const total = sequence.activities.length;
    const participated = sequence.activities.filter(a => a.hasParticipated).length;
    const opened = sequence.activities.filter(a => a.openedAt).length;
    return { total, participated, opened };
  };

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (error) {
    return (
      <div className={styles.loading}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#C83B50', marginBottom: '1rem' }}>{error}</div>
          <button
            onClick={() => window.location.reload()}
            className={styles.emptyLink}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const getFilteredSequences = () => {
    switch (sequenceFilter) {
      case 'enrolled': return enrolledSequences;
      case 'invitations': return invitedSequences;
      case 'open': return publicSequences;
      default: return [];
    }
  };

  const getFilteredActivities = () => {
    switch (activityFilter) {
      case 'open':
        return standaloneActivities.filter(activity => activity.status !== 'completed');
      case 'completed':
        return standaloneActivities.filter(activity => activity.status === 'completed');
      default: return [];
    }
  };

  const filteredSequences = getFilteredSequences();
  const filteredActivities = getFilteredActivities();

  // Games this account has no membership in. Derived from Instance.app, which
  // the backend now returns on /instances/mine — before that this list had no
  // stored answer to work from.
  const joinedApps = new Set(editions.map(gameApp));
  const unjoinedGames = ALL_GAMES.filter(g => !joinedApps.has(g.app));

  return (
    <div className={styles.page}>
      <div className={styles.grain} />

      <div className={styles.container}>
        {/* Nav */}
        <nav className={styles.nav}>
          <div className={styles.navInner}>
            <Link href="/" className={styles.navHome}>
              Holo<span>scopic</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <span className={styles.navLabel}>Dashboard</span>
              <UserMenu />
            </div>
          </div>
        </nav>

        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Everything you&apos;re part of, across the site</p>
        </div>

        <div className={styles.divider} />

        {/* Main Tabs */}
        <div className={styles.tabs}>
          <button
            onClick={() => setActiveTab('games')}
            className={`${styles.tab} ${activeTab === 'games' ? styles.tabActive : ''}`}
          >
            Games
          </button>
          <button
            onClick={() => setActiveTab('sequences')}
            className={`${styles.tab} ${activeTab === 'sequences' ? styles.tabActive : ''}`}
          >
            Sequences
          </button>
          <button
            onClick={() => setActiveTab('activities')}
            className={`${styles.tab} ${activeTab === 'activities' ? styles.tabActive : ''}`}
          >
            Activities
          </button>
        </div>

        {/* Filter Pills */}
        {activeTab !== 'games' && (
        <div className={styles.filters}>
          {activeTab === 'sequences' ? (
            <>
              <button
                onClick={() => setSequenceFilter('enrolled')}
                className={`${styles.pill} ${sequenceFilter === 'enrolled' ? styles.pillActive : ''}`}
              >
                Enrolled ({enrolledSequences.length})
              </button>
              <button
                onClick={() => setSequenceFilter('invitations')}
                className={`${styles.pill} ${sequenceFilter === 'invitations' ? styles.pillActive : ''}`}
              >
                Invitations ({invitedSequences.length})
              </button>
              <button
                onClick={() => setSequenceFilter('open')}
                className={`${styles.pill} ${sequenceFilter === 'open' ? styles.pillActive : ''}`}
              >
                Open ({publicSequences.length})
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setActivityFilter('open')}
                className={`${styles.pill} ${activityFilter === 'open' ? styles.pillActive : ''}`}
              >
                Open ({standaloneActivities.filter(a => a.status !== 'completed').length})
              </button>
              <button
                onClick={() => setActivityFilter('completed')}
                className={`${styles.pill} ${activityFilter === 'completed' ? styles.pillActive : ''}`}
              >
                Completed ({standaloneActivities.filter(a => a.status === 'completed').length})
              </button>
            </>
          )}
        </div>
        )}

        {/* Content */}
        {activeTab === 'games' ? (
          <>
            {editions.length === 0 ? (
              <div className={styles.empty}>
                You haven&apos;t joined a game yet.
              </div>
            ) : (
              <div className={styles.list}>
                {editions.map((ed, index) => {
                  const ended = ed.endDate ? new Date(ed.endDate) < new Date() : false;
                  const live = ed.active && !ended;
                  const app = gameApp(ed);
                  const href = gameEntryUrl(ed);
                  const external = isExternalGame(ed);
                  // Editions are an interView concept; a memorial or a
                  // Synthesis idea carrying a gameNumber is a data bug, so it
                  // is only shown where it means something.
                  const showEdition = app === 'interview' && ed.gameNumber != null;
                  const linkProps = external
                    ? { href, target: '_blank' as const, rel: 'noopener noreferrer' }
                    : { href };

                  return (
                    <div key={ed.id} className={styles.listItem}>
                      <div className={styles.listRow}>
                        <span className={styles.listNum}>{index + 1}.</span>
                        <div className={styles.listBody}>
                          <div className={styles.listHeader}>
                            <a {...linkProps} className={styles.listTitle}>
                              {app === 'interview' ? (
                                <>inter<span style={{ color: '#C83B50' }}>View</span></>
                              ) : (
                                gameProductName(ed)
                              )}
                              {showEdition && ` ${editionLabel(ed)}`}
                              {ed.name && ed.name.toLowerCase() !== app && ` · ${ed.name}`}
                            </a>
                            <span className={`${styles.badge} ${live ? styles.badgeActive : styles.badgeCompleted}`}>
                              {live ? 'Live' : 'Ended'}
                            </span>
                          </div>
                          <div className={styles.listMeta}>
                            {/* Chorus has no holon economy at all, so a
                                balance of 0 there is a fact about the game
                                rather than about this player. */}
                            {app !== 'chorus' && <span>{ed.holonBalance} Holons</span>}
                            {ed.joinedAt && (
                              <span>Joined {new Date(ed.joinedAt).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        <a {...linkProps} className={styles.viewLink}>
                          Enter &rarr;
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Somewhere to go. A new account lands here straight from signup,
                and without this the first thing the platform shows a new user
                is three empty tabs. */}
            {unjoinedGames.length > 0 && (
              <div className={styles.suggest}>
                <p className={styles.suggestLabel}>
                  {editions.length === 0 ? 'Start here' : 'Also on Holoscopic'}
                </p>
                <div className={styles.suggestRow}>
                  {unjoinedGames.map(g => (
                    <a
                      key={g.app}
                      href={g.href}
                      {...(g.href.startsWith('http')
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                      className={styles.suggestCard}
                    >
                      <span className={styles.suggestTitle}>{g.title}</span>
                      <span className={styles.suggestDesc}>{g.desc}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : activeTab === 'sequences' && filteredSequences.length === 0 ? (
          <div className={styles.empty}>
            {sequenceFilter === 'enrolled' && 'You haven\'t enrolled in any sequences yet.'}
            {sequenceFilter === 'invitations' && 'No pending invitations.'}
            {sequenceFilter === 'open' && 'No public sequences available.'}
          </div>
        ) : activeTab === 'activities' && filteredActivities.length === 0 ? (
          <div className={styles.empty}>
            {activityFilter === 'open' && 'No open activities.'}
            {activityFilter === 'completed' && 'No completed activities yet.'}
          </div>
        ) : (
          <div className={styles.list}>
            {/* Sequences List */}
            {activeTab === 'sequences' && filteredSequences.map((sequence, index) => {
              const stats = getSequenceStats(sequence);
              const progressPercent = stats.total > 0 ? Math.round((stats.participated / stats.total) * 100) : 0;

              return (
                <div key={sequence.id} className={styles.listItem}>
                  <div className={styles.listRow}>
                    <span className={styles.listNum}>{index + 1}.</span>
                    <div className={styles.listBody}>
                      <div className={styles.listHeader}>
                        <Link href={`/sequence/${sequence.urlName}`} className={styles.listTitle}>
                          {sequence.title}
                        </Link>
                        <span className={`${styles.badge} ${
                          sequence.status === 'active' ? styles.badgeActive
                            : sequence.status === 'completed' ? styles.badgeCompleted
                            : styles.badgeDraft
                        }`}>
                          {sequence.status}
                        </span>
                      </div>
                      {sequence.description && (
                        <p className={styles.listDesc}>{sequence.description}</p>
                      )}
                      <div className={styles.listMeta}>
                        <span>{stats.participated}/{stats.total} completed</span>
                        <span>{stats.opened} open</span>
                        <span>{sequence.members.length} members</span>
                        <div className={styles.progressBar}>
                          <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
                        </div>
                      </div>
                    </div>
                    <Link href={`/sequence/${sequence.urlName}`} className={styles.viewLink}>
                      View &rarr;
                    </Link>
                  </div>
                </div>
              );
            })}

            {/* Activities List */}
            {activeTab === 'activities' && filteredActivities.map((activity, index) => {
              const mySlots: number[] = (activity as HoloscopicActivity & { mySlots?: number[] }).mySlots || [];
              const userEntryCount = mySlots.length;
              const isSoloTracker = activity.maxEntries === 0;
              const allSlotsSubmitted = !isSoloTracker &&
                Array.from({ length: activity.maxEntries || 1 }, (_, i) => i + 1)
                  .every(slot => mySlots.includes(slot));
              const showResults = activity.status === 'completed' || allSlotsSubmitted;

              return (
                <div key={activity.id} className={styles.listItem}>
                  <div className={styles.listRow}>
                    <span className={styles.listNum}>{index + 1}.</span>
                    <div className={styles.listBody}>
                      <div className={styles.listHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Link href={`/a/${activity.urlName}`} className={styles.listTitle}>
                            {activity.title}
                          </Link>
                          <span className={styles.listType}>
                            <ActivityTypeIcon type={activity.activityType} size={12} />
                            {getActivityTypeLabel(activity.activityType)}
                          </span>
                        </div>
                        <span className={`${styles.badge} ${activity.status === 'completed' ? styles.badgeCompleted : styles.badgeActive}`}>
                          {activity.status === 'completed' ? 'Completed' : 'Active'}
                        </span>
                      </div>
                      <div className={styles.listMeta}>
                        <span>{activity.participants?.length || 0} participants</span>
                        <span>{(activity as HoloscopicActivity & { commentCount?: number }).commentCount || 0} comments</span>
                        <span>Your entries: {userEntryCount}</span>
                      </div>
                    </div>
                    <Link href={`/a/${activity.urlName}`} className={styles.viewLink}>
                      {showResults ? 'Results \u2192' : 'Continue \u2192'}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <Link href="/" className={styles.footerLink}>Home</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
