'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sequence } from '@/models/Sequence';
import { HoloscopicActivity } from '@/models/Activity';
import { SequenceService } from '@/services/sequenceService';
import { ActivityService } from '@/services/activityService';
import { FormattingService } from '@/utils/formatting';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';
import ActivityTypeIcon from '@/components/icons/ActivityTypeIcon';
import { getActivityTypeLabel } from '@/components/activities/types';
import styles from './page.module.css';

type TabType = 'activities' | 'sequences';
type SequenceFilterType = 'enrolled' | 'invitations' | 'open';
type ActivityFilterType = 'open' | 'completed';

export default function DashboardPage() {
  const router = useRouter();
  const { userId, userEmail, isLoading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('sequences');
  const [sequenceFilter, setSequenceFilter] = useState<SequenceFilterType>('enrolled');
  const [activityFilter, setActivityFilter] = useState<ActivityFilterType>('open');

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

        const enrolledData = await SequenceService.getUserSequences(userId);
        setEnrolledSequences(enrolledData);

        const publicData = await SequenceService.getPublicSequences();
        const enrolledIds = enrolledData.map(s => s.id);
        const notEnrolledPublic = publicData.filter(s => !enrolledIds.includes(s.id));
        setPublicSequences(notEnrolledPublic);

        if (userEmail) {
          const allPublicAndPrivate = await SequenceService.getAdminSequences();
          const invited = allPublicAndPrivate.filter(seq =>
            seq.requireInvitation &&
            seq.invitedEmails?.includes(userEmail.toLowerCase()) &&
            !enrolledIds.includes(seq.id)
          );
          setInvitedSequences(invited);
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
  }, [userId, userEmail]);

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
          <p className={styles.subtitle}>Your sequences and activities</p>
        </div>

        <div className={styles.divider} />

        {/* Main Tabs */}
        <div className={styles.tabs}>
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

        {/* Content */}
        {activeTab === 'sequences' && filteredSequences.length === 0 ? (
          <div className={styles.empty}>
            {sequenceFilter === 'enrolled' && 'You haven\'t enrolled in any sequences yet.'}
            {sequenceFilter === 'invitations' && 'No pending invitations.'}
            {sequenceFilter === 'open' && 'No public sequences available.'}
            <div>
              <Link href="/activities" className={styles.emptyLink}>
                Browse activities &rarr;
              </Link>
            </div>
          </div>
        ) : activeTab === 'activities' && filteredActivities.length === 0 ? (
          <div className={styles.empty}>
            {activityFilter === 'open' && 'No open activities.'}
            {activityFilter === 'completed' && 'No completed activities yet.'}
            <div>
              <Link href="/activities" className={styles.emptyLink}>
                Explore activities &rarr;
              </Link>
            </div>
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
              const userRating = activity.ratings?.find(r => r.userId === userId);
              const hasSubmitted = !!userRating;

              return (
                <div key={activity.id} className={styles.listItem}>
                  <div className={styles.listRow}>
                    <span className={styles.listNum}>{index + 1}.</span>
                    <div className={styles.listBody}>
                      <div className={styles.listHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Link href={`/${activity.urlName}`} className={styles.listTitle}>
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
                        <span>{activity.comments?.length || 0} comments</span>
                        <span>
                          {hasSubmitted
                            ? `Completed ${FormattingService.formatTimestamp(userRating.timestamp || activity.createdAt)}`
                            : `Joined ${FormattingService.formatTimestamp(activity.createdAt)}`
                          }
                        </span>
                      </div>
                    </div>
                    <Link href={`/${activity.urlName}`} className={styles.viewLink}>
                      {hasSubmitted ? 'Results \u2192' : 'Continue \u2192'}
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
            <Link href="/activities" className={styles.footerLink}>Explore</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
