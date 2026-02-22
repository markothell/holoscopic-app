'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Sequence } from '@/models/Sequence';
import { SequenceService } from '@/services/sequenceService';
import { FormattingService } from '@/utils/formatting';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';
import ActivityTypeIcon from '@/components/icons/ActivityTypeIcon';
import { getActivityTypeLabel } from '@/components/activities/types';
import type { ActivityType } from '@/models/Activity';
import styles from './page.module.css';

const SequenceGraphView = dynamic(
  () => import('@/components/graph/SequenceGraphView'),
  { ssr: false, loading: () => <div style={{ height: 500, background: '#F7F4EF', border: '1px solid #D9D4CC', borderRadius: 8 }} /> }
);

export default function SequenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const urlName = params.urlName as string;
  const { userId, userEmail, isAuthenticated, isLoading: authLoading } = useAuth();

  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = original; };
  }, []);

  useEffect(() => {
    if (!urlName || !userId) return;

    const loadSequence = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await SequenceService.getSequenceByUrlName(urlName, userId);
        setSequence(data);
        const member = data.members.find(m => m.userId === userId);
        setIsEnrolled(!!member);
      } catch (err) {
        setError('Failed to load sequence.');
        console.error('Error loading sequence:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSequence();
  }, [urlName, userId]);

  const handleEnroll = async () => {
    if (!sequence || !userId) return;

    if (!isAuthenticated) {
      router.push(`/signup?callbackUrl=${encodeURIComponent(`/sequence/${urlName}`)}`);
      return;
    }

    try {
      setEnrolling(true);
      await SequenceService.addMember(sequence.id, userId, userEmail || undefined);
      setIsEnrolled(true);
      const updated = await SequenceService.getSequenceByUrlName(urlName, userId);
      setSequence(updated);
    } catch (err: any) {
      console.error('Error enrolling:', err);
      alert('Failed to enroll in sequence');
    } finally {
      setEnrolling(false);
    }
  };

  const getActivityStatus = (activity: any) => {
    const now = new Date();
    const openedAt = activity.openedAt ? new Date(activity.openedAt) : null;
    const closedAt = activity.closedAt ? new Date(activity.closedAt) : null;

    if (!openedAt) return { text: 'Not Started', style: styles.badgeNotStarted };
    if (closedAt && now > closedAt) return { text: 'Closed', style: styles.badgeClosed };
    return { text: 'Open', style: styles.badgeOpen };
  };

  const getDaysRemaining = (activity: any) => {
    if (!activity.openedAt || !activity.autoClose || !activity.closedAt) return null;
    const now = new Date();
    const closedAt = new Date(activity.closedAt);
    if (now > closedAt) return 0;
    const diff = closedAt.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (error || !sequence) {
    return (
      <div className={styles.loading}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#C83B50', marginBottom: '1.5rem' }}>{error || 'Sequence not found'}</div>
          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
            <Link href="/dashboard" className={styles.errorLink}>&larr; Dashboard</Link>
            <button onClick={() => window.location.reload()} className={styles.errorLink} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stats = sequence.activities.length > 0 ? {
    total: sequence.activities.length,
    participated: sequence.activities.filter(a => a.hasParticipated).length,
    opened: sequence.activities.filter(a => a.openedAt).length,
  } : { total: 0, participated: 0, opened: 0 };

  const progressPercent = stats.total > 0 ? Math.round((stats.participated / stats.total) * 100) : 0;

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
              <span className={styles.navLabel}>{sequence.title}</span>
              <UserMenu />
            </div>
          </div>
        </nav>

        {/* Breadcrumb */}
        <Link href="/dashboard" className={styles.breadcrumb}>
          &larr; Dashboard
        </Link>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerRow}>
            <div>
              <h1 className={styles.title}>{sequence.title}</h1>
              {sequence.description && (
                <p className={styles.description}>{sequence.description}</p>
              )}
            </div>
            <span className={`${styles.badge} ${
              sequence.status === 'active' ? styles.badgeActive
                : sequence.status === 'completed' ? styles.badgeCompleted
                : styles.badgeDraft
            }`}>
              {sequence.status}
            </span>
          </div>
        </div>

        <div className={styles.divider} />

        {/* Enrollment / Welcome */}
        {!isEnrolled && sequence.status !== 'completed' && (
          <div className={styles.enrollCard}>
            {sequence.welcomePage?.enabled && sequence.welcomePage.welcomeText ? (
              <>
                <div className={styles.enrollWelcome}>{sequence.welcomePage.welcomeText}</div>
                {sequence.welcomePage.referenceLink && (
                  <a
                    href={sequence.welcomePage.referenceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.enrollRefLink}
                  >
                    Reference Material &rarr;
                  </a>
                )}
                <button onClick={handleEnroll} disabled={enrolling} className={styles.enrollBtn}>
                  {enrolling ? 'Enrolling...' : 'Enroll in This Sequence'}
                </button>
              </>
            ) : (
              <div className={styles.enrollInline}>
                <div>
                  <h2 className={styles.enrollInlineTitle}>Not Enrolled</h2>
                  <p className={styles.enrollInlineSub}>Join this sequence to participate</p>
                </div>
                <button onClick={handleEnroll} disabled={enrolling} className={styles.enrollInlineBtn}>
                  {enrolling ? 'Enrolling...' : 'Enroll'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Progress (enrolled users) */}
        {isEnrolled && (
          <div className={styles.progressCard}>
            <button
              onClick={() => setDetailsExpanded(!detailsExpanded)}
              className={styles.progressToggle}
            >
              <div className={styles.progressInfo}>
                <span className={styles.progressLabel}>Progress</span>
                <span className={styles.progressCount}>{stats.participated}/{stats.total} completed</span>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
              <span className={styles.progressIcon}>{detailsExpanded ? '\u2212' : '+'}</span>
            </button>

            {detailsExpanded && (
              <div className={styles.progressDetails}>
                <div className={styles.progressStats}>
                  <span><strong className={styles.progressStatsStrong}>{stats.opened}</strong> open</span>
                  <span><strong className={styles.progressStatsStrong}>{sequence.members.length}</strong> members</span>
                </div>
                {sequence.welcomePage?.enabled && sequence.welcomePage.welcomeText && (
                  <div className={styles.progressAbout}>
                    <h3 className={styles.progressAboutLabel}>About</h3>
                    <p className={styles.progressAboutText}>{sequence.welcomePage.welcomeText}</p>
                  </div>
                )}
                {sequence.welcomePage?.enabled && sequence.welcomePage.referenceLink && (
                  <a
                    href={sequence.welcomePage.referenceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.enrollRefLink}
                    style={{ marginTop: '1rem' }}
                  >
                    Reference Material &rarr;
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Activities */}
        <div className={styles.activitiesHeader}>
          <h2 className={styles.activitiesTitle}>Activities</h2>
          {sequence.activities.length > 0 && (
            <div className={styles.viewToggle}>
              <button
                onClick={() => setViewMode('list')}
                className={`${styles.viewToggleBtn} ${viewMode === 'list' ? styles.viewToggleBtnActive : ''}`}
              >
                List
              </button>
              <button
                onClick={() => setViewMode('graph')}
                className={`${styles.viewToggleBtn} ${viewMode === 'graph' ? styles.viewToggleBtnActive : ''}`}
              >
                Graph
              </button>
            </div>
          )}
        </div>

        {sequence.activities.length === 0 ? (
          <div className={styles.empty}>No activities in this sequence yet.</div>
        ) : viewMode === 'graph' ? (
          <SequenceGraphView
            activities={sequence.activities}
            sequenceId={sequence.id}
            isEnrolled={isEnrolled}
          />
        ) : (
          <div className={styles.activityCards}>
            {sequence.activities
              .sort((a, b) => a.order - b.order)
              .map((seqActivity, index) => {
                const activity = seqActivity.activity;
                const status = getActivityStatus(seqActivity);
                const daysRemaining = getDaysRemaining(seqActivity);

                return (
                  <div key={seqActivity.activityId} className={styles.activityCard}>
                    <div className={styles.activityRow}>
                      <div className={styles.activityNum}>{index + 1}</div>
                      <div className={styles.activityBody}>
                        <div className={styles.activityHeader}>
                          <div>
                            <span className={styles.activityTitle}>
                              {activity?.title || 'Activity Not Found'}
                            </span>
                            {activity?.activityType && (
                              <span className={styles.activityType}>
                                <ActivityTypeIcon type={activity.activityType as ActivityType} size={12} />
                                {getActivityTypeLabel(activity.activityType as ActivityType)}
                              </span>
                            )}
                            {seqActivity.openedAt && (
                              <p className={styles.activityDate}>
                                Opened {FormattingService.formatTimestamp(seqActivity.openedAt)}
                                {daysRemaining !== null && daysRemaining > 0 && (
                                  <span> &middot; {daysRemaining} days remaining</span>
                                )}
                              </p>
                            )}
                          </div>
                          <div className={styles.activityBadges}>
                            <span className={`${styles.badge} ${status.style}`}>
                              {status.text}
                            </span>
                            {seqActivity.hasParticipated && (
                              <span className={`${styles.badge} ${styles.badgeDone}`}>
                                Done
                              </span>
                            )}
                          </div>
                        </div>

                        {activity && (
                          <div className={styles.activityMeta}>
                            <span>{activity.participants || 0} participants</span>
                            <span>{activity.completedMappings || 0} mappings</span>
                            {seqActivity.autoClose && seqActivity.duration && (
                              <span>Duration: {seqActivity.duration} days</span>
                            )}
                          </div>
                        )}

                        {activity && seqActivity.openedAt && isEnrolled && (
                          <Link
                            href={`/${activity.urlName}?sequence=${sequence.id}`}
                            className={styles.activityLink}
                          >
                            {status.text === 'Closed' || seqActivity.hasParticipated ? 'View Results \u2192' : 'Participate \u2192'}
                          </Link>
                        )}
                        {activity && seqActivity.openedAt && status.text !== 'Closed' && !isEnrolled && (
                          <p className={styles.activityHint}>Enroll to participate</p>
                        )}
                        {!activity && (
                          <p className={styles.activityError}>Activity data unavailable</p>
                        )}
                        {!seqActivity.openedAt && (
                          <p className={styles.activityHint}>Opens later</p>
                        )}
                      </div>
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
            <Link href="/dashboard" className={styles.footerLink}>Dashboard</Link>
            <a href="https://wiki.holoscopic.io" className={styles.footerLink}>Wiki</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
