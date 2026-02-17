'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ActivityService } from '@/services/activityService';
import { HoloscopicActivity } from '@/models/Activity';
import { FormattingService } from '@/utils/formatting';
import { useAllAnalytics } from '@/hooks/useAnalytics';
import UserMenu from '@/components/UserMenu';
import styles from './page.module.css';

export default function MapsPage() {
  const [activities, setActivities] = useState<HoloscopicActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { allStats } = useAllAnalytics();

  useEffect(() => {
    // Set body background color
    document.body.style.background = '#F7F4EF';

    loadActivities();

    // Cleanup on unmount
    return () => {
      document.body.style.background = '';
    };
  }, []);

  const loadActivities = async () => {
    try {
      setLoading(true);
      setError(null);
      const activitiesData = await ActivityService.getActivities();
      // Only show published activities
      const publishedActivities = activitiesData.filter(a => !a.isDraft);
      setActivities(publishedActivities);
    } catch (err) {
      setError('Failed to load activities');
      console.error('Error loading activities:', err);
    } finally {
      setLoading(false);
    }
  };

  const getActivityStats = (activityId: string) => {
    return allStats?.[activityId] || null;
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Loading activities...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.innerContainer}>
        {/* Header */}
        <nav className={styles.nav}>
          <div className={styles.navLeft}>
            <Link href="/" className={styles.wordmark}>
              <span className={styles.wordmarkHolo}>Holo</span>
              <span className={styles.wordmarkScopic}>scopic</span>
            </Link>
            <div className={styles.pageLabel}>Maps</div>
          </div>
          <UserMenu />
        </nav>

        {error && (
          <div className={styles.errorContainer}>
            <div className={styles.errorMessage}>{error}</div>
            <button
              onClick={loadActivities}
              className={styles.retryButton}
            >
              Retry
            </button>
          </div>
        )}

        {activities.length === 0 && !error && (
          <div className={styles.emptyContainer}>
            <div className={styles.emptyMessage}>
              No public activities available yet
            </div>
            <Link
              href="/admin"
              className={styles.createButton}
            >
              Create First Map
            </Link>
          </div>
        )}

        {activities.length > 0 && (
          <div className={styles.grid}>
            {activities.map(activity => {
              const stats = getActivityStats(activity.id);
              return (
                <Link
                  key={activity.id}
                  href={`/${activity.urlName}`}
                  className={styles.activityCard}
                >
                  <h2 className={styles.activityTitle}>
                    {activity.title}
                  </h2>
                  {activity.preamble && (
                    <p className={styles.activityPreamble}>
                      {activity.preamble}
                    </p>
                  )}
                  <div className={styles.activityMeta}>
                    Created {FormattingService.formatTimestamp(activity.createdAt)}
                  </div>
                  {stats && (
                    <div className={styles.activityStats}>
                      <span>{stats.participants} participants</span>
                      <span>{stats.comments} comments</span>
                    </div>
                  )}
                  {activity.status === 'active' && (
                    <span className={`${styles.statusBadge} ${styles.active}`}>
                      Open
                    </span>
                  )}
                  {activity.status === 'completed' && (
                    <span className={`${styles.statusBadge} ${styles.completed}`}>
                      Completed
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        <footer className={styles.footer}>
          <div className={styles.footerLinks}>
            <Link href="/" className={styles.footerLink}>Home</Link>
            <Link href="/admin" className={styles.footerLink}>Admin</Link>
            <Link href="/dashboard" className={styles.footerLink}>Dashboard</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
