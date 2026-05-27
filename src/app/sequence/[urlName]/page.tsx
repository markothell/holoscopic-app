'use client';

import { useState, useEffect, useRef } from 'react';
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
  const { userId, userEmail, userName, isAuthenticated, isLoading: authLoading } = useAuth();

  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');
  const [collapsedRounds, setCollapsedRounds] = useState<Set<number>>(new Set());

  const activityRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = original; };
  }, []);

  useEffect(() => {
    if (!urlName || authLoading) return;

    const loadSequence = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await SequenceService.getSequenceByUrlName(urlName, userId || undefined);
        setSequence(data);

        const enrolled = userId ? data.members.some(m => m.userId === userId) : false;
        setIsEnrolled(enrolled);

        // Collapse summary for already-enrolled returning users
        if (enrolled) setSummaryExpanded(false);

        // Auto-enroll when returning from login/signup with ?enroll=true
        if (!enrolled && userId && isAuthenticated) {
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('enroll') === 'true') {
            try {
              setEnrolling(true);
              await SequenceService.addMember(data.id, userId, userEmail || undefined, userName || undefined);
              const updated = await SequenceService.getSequenceByUrlName(urlName, userId);
              setSequence(updated);
              setIsEnrolled(true);
              setSummaryExpanded(false);
              // Clean the enroll param from URL without navigating
              const clean = new URL(window.location.href);
              clean.searchParams.delete('enroll');
              window.history.replaceState(null, '', clean.pathname + (clean.search || ''));
            } catch (err) {
              console.error('Auto-enroll error:', err);
            } finally {
              setEnrolling(false);
            }
          }
        }
      } catch (err) {
        setError('Failed to load sequence.');
        console.error('Error loading sequence:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSequence();
  }, [urlName, userId, authLoading]);

  const handleCTA = async () => {
    if (!isAuthenticated) {
      const callbackUrl = `/sequence/${urlName}?enroll=true`;
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }
    if (!isEnrolled) {
      await handleEnroll();
      return;
    }
    // Scroll to next open activity the user hasn't participated in
    const nextOpen = sequence?.activities
      .slice()
      .sort((a, b) => a.order - b.order)
      .find(a => a.openedAt && !isActivityClosed(a));
    if (nextOpen) {
      const round = getActivityRound(nextOpen);
      // Expand that round before scrolling
      setCollapsedRounds(prev => {
        const next = new Set(prev);
        next.delete(round);
        return next;
      });
      // Wait a tick for round to expand, then scroll
      setTimeout(() => {
        activityRefs.current[nextOpen.activityId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  };

  const handleEnroll = async () => {
    if (!sequence || !userId) return;
    try {
      setEnrolling(true);
      await SequenceService.addMember(sequence.id, userId, userEmail || undefined, userName || undefined);
      const updated = await SequenceService.getSequenceByUrlName(urlName, userId);
      setSequence(updated);
      setIsEnrolled(true);
      setSummaryExpanded(false);
    } catch (err: any) {
      console.error('Error enrolling:', err);
      alert('Failed to enroll in sequence');
    } finally {
      setEnrolling(false);
    }
  };

  const isActivityClosed = (activity: any) => {
    const closedAt = activity.closedAt ? new Date(activity.closedAt) : null;
    return closedAt !== null && new Date() > closedAt;
  };

  const getActivityStatus = (activity: any) => {
    const openedAt = activity.openedAt ? new Date(activity.openedAt) : null;
    const closedAt = activity.closedAt ? new Date(activity.closedAt) : null;
    const now = new Date();
    if (!openedAt) return { text: 'Not Started', style: styles.badgeNotStarted };
    if (closedAt && now > closedAt) return { text: 'Closed', style: styles.badgeClosed };
    return { text: 'Open', style: styles.badgeOpen };
  };

  const getDaysRemaining = (activity: any) => {
    if (!activity.openedAt || !activity.autoClose || !activity.closedAt) return null;
    const now = new Date();
    const closedAt = new Date(activity.closedAt);
    if (now > closedAt) return 0;
    return Math.ceil((closedAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getActivityRound = (seqActivity: any): number => seqActivity.round ?? 1;

  const toggleRound = (round: number) => {
    setCollapsedRounds(prev => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  };

  if (loading || authLoading) {
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

  const stats = {
    total: sequence.activities.length,
    participated: sequence.activities.filter(a => a.hasParticipated).length,
    opened: sequence.activities.filter(a => a.openedAt).length,
  };
  const progressPercent = stats.total > 0 ? Math.round((stats.participated / stats.total) * 100) : 0;

  // Next open activity for CTA scroll target
  const nextOpenActivity = sequence.activities
    .slice()
    .sort((a, b) => a.order - b.order)
    .find(a => a.openedAt && !isActivityClosed(a));

  // Group activities by round
  const sortedActivities = [...sequence.activities].sort((a, b) => a.order - b.order);
  const roundMap = new Map<number, typeof sortedActivities>();
  sortedActivities.forEach(act => {
    const round = getActivityRound(act);
    if (!roundMap.has(round)) roundMap.set(round, []);
    roundMap.get(round)!.push(act);
  });
  const roundNumbers = Array.from(roundMap.keys()).sort((a, b) => a - b);

  // CTA label
  const getCTALabel = () => {
    if (enrolling) return 'Joining…';
    if (!isAuthenticated) return 'Sign in to join →';
    if (!isEnrolled) return 'Enroll in this sequence →';
    if (nextOpenActivity) return 'Go to next activity →';
    return null;
  };
  const ctaLabel = getCTALabel();

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

        {/* Breadcrumb — only for authenticated users */}
        {isAuthenticated && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
            <Link href="/dashboard" className={styles.breadcrumb} style={{ marginBottom: 0 }}>
              &larr; Dashboard
            </Link>
            {sequence && userId && sequence.createdBy === userId && (
              <Link
                href={`/sequence/${urlName}/manage`}
                className={styles.breadcrumb}
                style={{ marginBottom: 0, color: 'var(--accent-blue)' }}
              >
                Manage →
              </Link>
            )}
          </div>
        )}

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerRow}>
            <h1 className={styles.title}>{sequence.title}</h1>
            <span className={`${styles.badge} ${
              sequence.status === 'active' ? styles.badgeActive
                : sequence.status === 'completed' ? styles.badgeCompleted
                : styles.badgeDraft
            }`}>
              {sequence.status}
            </span>
          </div>
        </div>

        {/* Sequence Summary — collapsible */}
        <div className={styles.summaryCard}>
          <button
            onClick={() => setSummaryExpanded(!summaryExpanded)}
            className={styles.summaryToggle}
          >
            <span className={styles.summaryToggleLabel}>About this sequence</span>
            <span className={styles.summaryToggleIcon}>{summaryExpanded ? '−' : '+'}</span>
          </button>

          {summaryExpanded && (
            <div className={styles.summaryBody}>
              {sequence.description && (
                <p className={styles.summaryDescription}>{sequence.description}</p>
              )}
              <div className={styles.summaryMetaRow}>
                {sequence.host && (
                  <span className={styles.summaryMetaItem}>
                    <span className={styles.summaryMetaLabel}>Host</span>
                    {sequence.host.name}
                  </span>
                )}
                <span className={styles.summaryMetaItem}>
                  <span className={styles.summaryMetaLabel}>Access</span>
                  {sequence.requireInvitation ? 'Invitation only' : 'Open'}
                </span>
                {stats.total > 0 && (
                  <span className={styles.summaryMetaItem}>
                    <span className={styles.summaryMetaLabel}>Activities</span>
                    {stats.total}
                  </span>
                )}
                {sequence.members.length > 0 && (
                  <span className={styles.summaryMetaItem}>
                    <span className={styles.summaryMetaLabel}>Members</span>
                    {sequence.members.length}
                  </span>
                )}
              </div>
              {sequence.welcomePage?.enabled && sequence.welcomePage.referenceLink && (
                <a
                  href={sequence.welcomePage.referenceLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.enrollRefLink}
                >
                  Reference Material &rarr;
                </a>
              )}
              {isEnrolled && userId && (
                <div className={styles.myActivityRow}>
                  <Link href={`/profile/${userId}?sequence=${sequence.id}`} className={styles.myActivityLink}>
                    My activity &rarr;
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Updates section — shown only when facilitator has added content */}
        {sequence.updates && (
          <div className={styles.updatesSection}>
            <h3 className={styles.updatesLabel}>Updates</h3>
            <p className={styles.updatesText}>{sequence.updates}</p>
          </div>
        )}

        {/* CTA strip — progress bar (enrolled) + primary action button */}
        <div className={styles.ctaStrip}>
          {isEnrolled && (
            <div className={styles.progressRow}>
              <span className={styles.progressCount}>{stats.participated}/{stats.total} completed</span>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}
          {ctaLabel ? (
            <button
              onClick={handleCTA}
              disabled={enrolling}
              className={styles.ctaBtn}
            >
              {ctaLabel}
            </button>
          ) : isEnrolled && (
            <p className={styles.ctaWait}>No open activities right now — check back soon.</p>
          )}
        </div>

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
            {roundNumbers.map(round => {
              const roundActivities = roundMap.get(round)!;
              const isCollapsed = collapsedRounds.has(round);
              const hasAnyOpen = roundActivities.some(a => getActivityStatus(a).text === 'Open');
              const allDone = roundActivities.every(a => a.hasParticipated);

              return (
                <div key={round} className={styles.roundGroup}>
                  <button
                    onClick={() => toggleRound(round)}
                    className={styles.roundHeader}
                  >
                    <div className={styles.roundHeaderLeft}>
                      <span className={styles.roundLabel}>Round {round}</span>
                      <span className={styles.roundCount}>{roundActivities.length} {roundActivities.length === 1 ? 'activity' : 'activities'}</span>
                      {hasAnyOpen && <span className={`${styles.badge} ${styles.badgeOpen} ${styles.roundBadge}`}>Open</span>}
                      {allDone && <span className={`${styles.badge} ${styles.badgeDone} ${styles.roundBadge}`}>Done</span>}
                    </div>
                    <span className={styles.roundToggleIcon}>{isCollapsed ? '+' : '−'}</span>
                  </button>

                  {!isCollapsed && (
                    <div className={styles.roundActivities}>
                      {roundActivities.map((seqActivity) => {
                        const activity = seqActivity.activity;
                        const status = getActivityStatus(seqActivity);
                        const daysRemaining = getDaysRemaining(seqActivity);
                        const globalIndex = sortedActivities.indexOf(seqActivity);

                        return (
                          <div
                            key={seqActivity.activityId}
                            className={styles.activityCard}
                            ref={el => { activityRefs.current[seqActivity.activityId] = el; }}
                          >
                            <div className={styles.activityRow}>
                              <div className={styles.activityNum}>{globalIndex + 1}</div>
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
                                    {status.text === 'Closed' ? 'View Results →' : 'Participate →'}
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
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <Link href="/" className={styles.footerLink}>Home</Link>
            {isAuthenticated && <Link href="/dashboard" className={styles.footerLink}>Dashboard</Link>}
          </div>
        </footer>
      </div>
    </div>
  );
}
