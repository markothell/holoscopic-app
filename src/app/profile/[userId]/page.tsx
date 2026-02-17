'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import styles from './page.module.css';

interface Activity {
  id: string;
  title: string;
  urlName: string;
  xAxisLabel: string;
  yAxisLabel: string;
  updatedAt: string;
  userEntries?: {
    slotNumber: number;
    objectName: string;
    x: number;
    y: number;
    comment?: string;
  }[];
}

interface UserProfile {
  id: string;
  name: string;
  sequenceId: string;
  sequenceUrlName: string;
  sequenceTitle: string;
  joinedAt: string;
  participatedActivities: Activity[];
}

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const { userId: viewerId } = useAuth();
  const targetUserId = params.userId as string;
  const sequenceId = searchParams.get('sequence');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = ''; };
  }, []);

  useEffect(() => {
    async function fetchProfile() {
      try {
        if (!sequenceId) {
          setError('Sequence context is required. Please access this profile from within a sequence.');
          setLoading(false);
          return;
        }

        if (targetUserId.startsWith('starter_')) {
          setProfile({
            id: targetUserId,
            name: 'Sample Data',
            sequenceId: sequenceId,
            sequenceUrlName: '',
            sequenceTitle: 'Sample Sequence',
            joinedAt: new Date().toISOString(),
            participatedActivities: []
          });
          setLoading(false);
          return;
        }

        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
        const response = await fetch(`${API_URL}/sequences/${sequenceId}/profile/${targetUserId}?viewerId=${viewerId || ''}`);

        if (response.status === 403) {
          setError('You do not have permission to view this profile. Only sequence members can view profiles.');
          setLoading(false);
          return;
        }

        if (response.status === 404) {
          setError('Profile not found in this sequence.');
          setLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch profile');
        }

        const data = await response.json();
        setProfile(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }

    if (targetUserId) {
      fetchProfile();
    }
  }, [targetUserId, sequenceId, viewerId]);

  if (loading) {
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

  if (!profile) {
    return null;
  }

  const isOwnProfile = viewerId === targetUserId;
  const displayName = profile.name || 'Anonymous';

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

        {profile.sequenceUrlName && (
          <Link
            href={`/sequence/${profile.sequenceUrlName}`}
            className={styles.breadcrumb}
          >
            &larr; Back to {profile.sequenceTitle}
          </Link>
        )}

        <div className={styles.profileHeader}>
          <div className={styles.avatar}>
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className={styles.profileName}>{displayName}</h1>
            <p className={styles.profileMeta}>
              {profile.sequenceTitle} &middot; Joined {new Date(profile.joinedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className={styles.divider} />

        {profile.participatedActivities && profile.participatedActivities.length > 0 && (
          <div>
            <h2 className={styles.sectionTitle}>Activity Participation</h2>
            {profile.participatedActivities.map((activity) => (
              <div key={activity.id} className={styles.activityCard}>
                <div className={styles.activityTitle}>{activity.title}</div>
                <div className={styles.activityAxes}>
                  {activity.xAxisLabel} &times; {activity.yAxisLabel}
                </div>

                {activity.userEntries && activity.userEntries.length > 0 && (
                  <div>
                    {activity.userEntries.map((entry) => (
                      <div key={entry.slotNumber} className={styles.entryCard}>
                        <div className={styles.entryHeader}>
                          <span className={styles.entrySlot}>Slot {entry.slotNumber}</span>
                          <span className={styles.entryName}>{entry.objectName}</span>
                        </div>
                        {entry.x !== undefined && entry.y !== undefined && (
                          <div className={styles.entryPosition}>
                            Position: ({entry.x.toFixed(1)}, {entry.y.toFixed(1)})
                          </div>
                        )}
                        {entry.comment && (
                          <div className={styles.entryComment}>
                            &ldquo;{entry.comment}&rdquo;
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {(!profile.participatedActivities || profile.participatedActivities.length === 0) && (
          <div className={styles.empty}>
            {isOwnProfile
              ? "You haven't participated in any activities in this sequence yet."
              : `${displayName} hasn't participated in any activities in this sequence yet.`
            }
          </div>
        )}

        <footer className={styles.footer}>
          <Link href="/" className={styles.footerLink}>Home</Link>
          <Link href="/dashboard" className={styles.footerLink}>Dashboard</Link>
          <a href="https://wiki.holoscopic.io" className={styles.footerLink}>Wiki</a>
        </footer>
      </div>
    </div>
  );
}
