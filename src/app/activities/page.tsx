'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sequence } from '@/models/Sequence';
import { SequenceService } from '@/services/sequenceService';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';
import ActivityTypeIcon from '@/components/icons/ActivityTypeIcon';
import { getActivityTypeLabel } from '@/components/activities/types';
import type { ActivityType } from '@/models/Activity';
import styles from './page.module.css';

interface Activity {
  id: string;
  title: string;
  urlName: string;
  mapQuestion: string;
  xAxis: { label: string; min: string; max: string };
  yAxis: { label: string; min: string; max: string };
  activityType?: string;
  status: 'draft' | 'active' | 'completed';
  isDraft?: boolean;
  participants: any[];
  ratings: any[];
  comments: any[];
  createdAt: string;
  isPublic?: boolean;
}

type TabType = 'activities' | 'sequences';

export default function ActivitiesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('activities');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { userId } = useAuth();

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = original; };
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

        const activityResponse = await fetch(`${API_URL}/activities`);
        if (!activityResponse.ok) throw new Error('Failed to fetch activities');
        const activityData = await activityResponse.json();
        if (activityData.success && activityData.data.activities) {
          const publicActivities = activityData.data.activities.filter((activity: Activity) =>
            activity.status === 'active' && !activity.isDraft && activity.isPublic !== false
          );
          setActivities(publicActivities);
        }

        const publicSequences = await SequenceService.getPublicSequences();
        setSequences(publicSequences);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (error) {
    return (
      <div className={styles.loading}>
        <div style={{ textAlign: 'center' }}>
          <div className={styles.errorText}>{error}</div>
          <Link href="/" className={styles.errorLink}>Back to Home</Link>
        </div>
      </div>
    );
  }

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
              <span className={styles.navLabel}>Explore</span>
              <UserMenu />
            </div>
          </div>
        </nav>

        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>Explore</h1>
          <p className={styles.subtitle}>
            Public mapping activities and learning sequences
          </p>
        </div>

        <div className={styles.divider} />

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            onClick={() => setActiveTab('activities')}
            className={`${styles.tab} ${activeTab === 'activities' ? styles.tabActive : ''}`}
          >
            Activities ({activities.length})
          </button>
          <button
            onClick={() => setActiveTab('sequences')}
            className={`${styles.tab} ${activeTab === 'sequences' ? styles.tabActive : ''}`}
          >
            Sequences ({sequences.length})
          </button>
        </div>

        {/* Content */}
        {activeTab === 'activities' ? (
          activities.length === 0 ? (
            <div className={styles.empty}>
              No public activities available at the moment.
            </div>
          ) : (
            <div className={styles.list}>
              {activities.map((activity, index) => (
                <Link
                  key={activity.id}
                  href={`/${activity.urlName}`}
                  className={styles.listItem}
                >
                  <span className={styles.listNum}>{index + 1}.</span>
                  <div className={styles.listBody}>
                    <span className={styles.listTitle}>{activity.title}</span>
                    <span className={styles.listType}>
                      <ActivityTypeIcon type={(activity.activityType || 'dissolve') as ActivityType} size={12} />
                      {getActivityTypeLabel((activity.activityType || 'dissolve') as ActivityType)}
                    </span>
                  </div>
                  <div className={styles.listMeta}>
                    <span>{activity.participants.length} participants</span>
                    <span>{activity.ratings.length} mappings</span>
                    <span>{activity.comments.length} comments</span>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : (
          sequences.length === 0 ? (
            <div className={styles.empty}>
              No public sequences available at the moment.
            </div>
          ) : (
            <div className={styles.list}>
              {sequences.map((sequence, index) => {
                const total = sequence.activities.length;
                const opened = sequence.activities.filter(a => a.openedAt).length;

                return (
                  <Link
                    key={sequence.id}
                    href={`/sequence/${sequence.urlName}`}
                    className={styles.listItem}
                  >
                    <span className={styles.listNum}>{index + 1}.</span>
                    <div className={styles.listBody}>
                      <span className={styles.listTitle}>{sequence.title}</span>
                      {sequence.description && (
                        <span className={styles.listDesc}>
                          &mdash; {sequence.description}
                        </span>
                      )}
                    </div>
                    <div className={styles.listMeta}>
                      <span>{total} activities</span>
                      <span>{opened} open</span>
                      <span>{sequence.members.length} members</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        )}

        {/* Footer */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <Link href="/" className={styles.footerLink}>Home</Link>
            <Link href="/login" className={styles.footerLink}>Log In</Link>
            <Link href="/dashboard" className={styles.footerLink}>Dashboard</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
