'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HoloscopicActivity } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';
import { FormattingService } from '@/utils/formatting';
import { useAllAnalytics, type AnalyticsStats } from '@/hooks/useAnalytics';
import { useAuth } from '@/contexts/AuthContext';
import AdminPanel from '@/components/AdminPanel';
import UserMenu from '@/components/UserMenu';
import ActivityTypeIcon from '@/components/icons/ActivityTypeIcon';
import { getActivityTypeLabel } from '@/components/activities/types';
import Link from 'next/link';
import styles from './page.module.css';

function AdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingActivityId = searchParams.get('activity');
  const shouldShowCreate = searchParams.get('create') === 'true';
  const returnUrl = searchParams.get('returnUrl');
  const { userId, isAuthenticated, isLoading: authLoading } = useAuth();

  const [activities, setActivities] = useState<HoloscopicActivity[]>([]);
  const [editingActivity, setEditingActivity] = useState<HoloscopicActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const { allStats, loading: analyticsLoading } = useAllAnalytics();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Close dropdown on click-outside
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuId]);

  const hasAccess = isAuthenticated;

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = original; };
  }, []);

  // Load activities and editing activity
  useEffect(() => {
    if (!hasAccess || !userId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const activitiesData = await ActivityService.getAdminActivities(userId);
        setActivities(activitiesData);

        if (editingActivityId) {
          const activity = activitiesData.find(a => a.id === editingActivityId);
          if (activity) {
            setEditingActivity(activity);
            setShowCreateForm(true);
          }
        } else if (shouldShowCreate) {
          setShowCreateForm(true);
        }
      } catch (err) {
        setError('Failed to load activities. The backend server may not be running.');
        console.error('Error loading activities:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [editingActivityId, shouldShowCreate, hasAccess, userId]);

  // Show loading while checking auth
  if (authLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  // Redirect unauthenticated users
  if (!hasAccess) {
    return (
      <div className={styles.denied}>
        <div className={styles.deniedCard}>
          <h1 className={styles.deniedTitle}>Sign in to create</h1>
          <p className={styles.deniedText}>
            You need to be signed in to access the Create panel.
          </p>
          <Link href="/login" className={styles.deniedLink}>
            Sign in &rarr;
          </Link>
        </div>
      </div>
    );
  }

  // Handle activity deletion
  const handleDeleteActivity = async (id: string) => {
    if (!confirm('Are you sure you want to delete this activity?')) {
      return;
    }

    try {
      await ActivityService.deleteActivity(id);
      setActivities(activities.filter(a => a.id !== id));
    } catch (err) {
      console.error('Error deleting activity:', err);
      alert('Failed to delete activity');
    }
  };

  // Handle activity duplication
  const handleDuplicateActivity = (activity: HoloscopicActivity) => {
    const duplicatedActivity: Partial<HoloscopicActivity> = {
      ...activity,
      id: '',
      urlName: `${activity.urlName}-copy-${Date.now()}`,
      title: `${activity.title} (Copy)`,
      isDraft: true,
      participants: [],
      ratings: [],
      comments: []
    };

    delete duplicatedActivity.createdAt;
    delete duplicatedActivity.updatedAt;

    setEditingActivity(duplicatedActivity as HoloscopicActivity);
    setShowCreateForm(true);
  };

  // Handle draft toggle
  const handleToggleDraft = async (id: string, currentlyDraft: boolean) => {
    try {
      const updatedActivity = await ActivityService.toggleDraftStatus(id, !currentlyDraft);
      setActivities(activities.map(a =>
        a.id === id ? updatedActivity : a
      ));
    } catch (err) {
      console.error('Error toggling draft status:', err);
      alert('Failed to toggle draft status');
    }
  };

  // Handle complete toggle
  const handleToggleComplete = async (id: string) => {
    if (!confirm('Are you sure you want to mark this activity as completed? This cannot be undone.')) {
      return;
    }

    try {
      const updatedActivity = await ActivityService.completeActivity(id);
      setActivities(activities.map(a =>
        a.id === id ? updatedActivity : a
      ));
    } catch (err) {
      console.error('Error completing activity:', err);
      alert('Failed to complete activity');
    }
  };

  // Handle create/update activity
  const handleSaveActivity = async (updatedActivity: HoloscopicActivity) => {
    try {
      const activitiesData = await ActivityService.getAdminActivities(userId || undefined);
      setActivities(activitiesData);
    } catch (err) {
      console.error('Error reloading activities:', err);
      if (editingActivity && editingActivity.id) {
        setActivities(activities.map(a =>
          a.id === updatedActivity.id ? updatedActivity : a
        ));
      } else {
        setActivities([...activities, updatedActivity]);
      }
    }

    setShowCreateForm(false);
    setEditingActivity(null);

    if (returnUrl) {
      alert('Activity saved! You can now close this tab and return to the sequence editor.');
      if (window.opener) {
        window.close();
      }
    } else {
      router.push('/admin');
    }
  };

  // Get statistics for an activity
  const getActivityStats = (activityId: string): AnalyticsStats | null => {
    if (analyticsLoading || !allStats) return null;
    return allStats[activityId] || null;
  };

  // Handle full JSON download
  const handleDownloadFullJSON = (activity: HoloscopicActivity) => {
    const sortedActivity = {
      ...activity,
      comments: [...(activity.comments || [])].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0))
    };

    const dataStr = JSON.stringify(sortedActivity, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activity.urlName}-full-data.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setOpenMenuId(null);
  };

  // Handle starter data JSON download
  const handleDownloadStarterData = (activity: HoloscopicActivity) => {
    const sortedComments = [...(activity.comments || [])].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));

    const starterEntries = sortedComments.map(comment => {
      const rating = activity.ratings?.find(r =>
        r.userId === comment.userId && r.slotNumber === comment.slotNumber
      );

      return {
        objectName: comment.objectName || 'Unnamed',
        position: rating ? { x: rating.position.x, y: rating.position.y } : { x: 0.5, y: 0.5 },
        comment: comment.text,
        votes: comment.voteCount || 0
      };
    });

    const dataStr = JSON.stringify(starterEntries, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activity.urlName}-starter-data.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setOpenMenuId(null);
  };

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (error) {
    return (
      <div className={styles.loading}>
        <div style={{ textAlign: 'center' }}>
          <div className={styles.errorText}>{error}</div>
          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
            <button onClick={() => window.location.reload()} className={styles.secondaryBtn}>
              Retry
            </button>
            <button onClick={() => setShowCreateForm(true)} className={styles.primaryBtn}>
              Create First Activity
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.wordmark}>
            Holo<span className={styles.wordmarkAccent}>scopic</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <span className={styles.pageLabel}>create</span>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {/* Page Title */}
        <h1 className={styles.pageTitle}>Create</h1>

        {/* Tabs */}
        <div className={styles.tabs}>
          <Link href="/admin" className={`${styles.tab} ${styles.tabActive}`}>
            Activities
          </Link>
          <Link href="/admin/sequences" className={styles.tab}>
            Sequences
          </Link>
        </div>

        {showCreateForm ? (
          <AdminPanel
            editingActivity={editingActivity || undefined}
            onActivityCreated={handleSaveActivity}
            onActivityUpdated={handleSaveActivity}
            onCancel={() => {
              setShowCreateForm(false);
              setEditingActivity(null);
              if (returnUrl) {
                if (window.opener) {
                  window.close();
                } else {
                  router.push('/admin');
                }
              } else {
                router.push('/admin');
              }
            }}
          />
        ) : (
          <div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Activities</h2>
              <button onClick={() => setShowCreateForm(true)} className={styles.primaryBtn}>
                New Activity
              </button>
            </div>

            {activities.length === 0 ? (
              <div className={styles.empty}>
                No activities yet. Create your first one!
              </div>
            ) : (
              <>
                {/* Mobile View - Cards */}
                <div className="lg:hidden">
                  <div className={styles.cardList}>
                    {activities.map(activity => {
                      const stats = getActivityStats(activity.id);
                      return (
                        <div key={activity.id} className={styles.card}>
                          <div className={styles.cardTop}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className={styles.cardTitle}>{activity.title}</div>
                              <div className={styles.cardSubtitle}>
                                <span className={styles.typeLabel}>
                                  <ActivityTypeIcon type={activity.activityType} size={14} />
                                  {getActivityTypeLabel(activity.activityType)}
                                </span>
                                <Link
                                  href={`/${activity.urlName}`}
                                  target="_blank"
                                  className={styles.cardLink}
                                >
                                  /{activity.urlName} ↗
                                </Link>
                              </div>
                            </div>
                            <span className={`${styles.badge} ${
                              activity.isDraft
                                ? styles.badgeDraft
                                : activity.status === 'completed'
                                ? styles.badgeCompleted
                                : styles.badgeActive
                            }`}>
                              {activity.isDraft ? 'Draft' : activity.status === 'completed' ? 'Completed' : 'Active'}
                            </span>
                          </div>

                          <div className={styles.cardMeta}>
                            <span>{stats?.participants || 0} participants</span>
                            <span>{stats?.completedMappings || 0} mappings</span>
                            <span>{stats?.comments || 0} comments</span>
                          </div>

                          <div className={styles.actions}>
                            <button
                              onClick={() => {
                                setEditingActivity(activity);
                                setShowCreateForm(true);
                                router.push(`/admin?activity=${activity.id}`);
                              }}
                              className={`${styles.actionBtn} ${styles.actionEdit}`}
                            >
                              Edit
                            </button>
                            <span className={styles.actionDot}>&middot;</span>
                            <button
                              onClick={() => handleToggleDraft(activity.id, activity.isDraft || false)}
                              className={`${styles.actionBtn} ${styles.actionPublish}`}
                            >
                              {activity.isDraft ? 'Publish' : 'Unpublish'}
                            </button>
                            <span className={styles.actionDot}>&middot;</span>
                            <button
                              onClick={() => handleDuplicateActivity(activity)}
                              className={`${styles.actionBtn} ${styles.actionDuplicate}`}
                            >
                              Duplicate
                            </button>
                            <span className={styles.actionDot}>&middot;</span>
                            <div className={styles.dropdown}>
                              <button
                                onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === activity.id ? null : activity.id); }}
                                className={`${styles.actionBtn} ${styles.actionJson}`}
                              >
                                JSON &#x25BE;
                              </button>
                              {openMenuId === activity.id && (
                                <div className={styles.dropdownMenu}>
                                  <button onClick={() => handleDownloadFullJSON(activity)} className={styles.dropdownItem}>
                                    Full Activity Data
                                  </button>
                                  <button onClick={() => handleDownloadStarterData(activity)} className={styles.dropdownItem}>
                                    Starter Data
                                  </button>
                                </div>
                              )}
                            </div>
                            <span className={styles.actionDot}>&middot;</span>
                            <button
                              onClick={() => handleDeleteActivity(activity.id)}
                              className={`${styles.actionBtn} ${styles.actionDelete}`}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Desktop View - Table */}
                <div className="hidden lg:block">
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead className={styles.tableHead}>
                        <tr>
                          <th className={styles.th}>Title</th>
                          <th className={styles.th}>URL</th>
                          <th className={styles.th}>Stats</th>
                          <th className={styles.th}>Status</th>
                          <th className={styles.th}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activities.map(activity => {
                          const stats = getActivityStats(activity.id);

                          return (
                            <tr key={activity.id} className={styles.tr}>
                              <td className={styles.td}>
                                <div className={styles.tdTitle}>{activity.title}</div>
                                <div className={styles.tdSub}>
                                  <span className={styles.typeLabel}>
                                    <ActivityTypeIcon type={activity.activityType} size={12} />
                                    {getActivityTypeLabel(activity.activityType)}
                                  </span>
                                  <span>&middot;</span>
                                  <span>{FormattingService.formatTimestamp(activity.createdAt)}</span>
                                </div>
                              </td>
                              <td className={styles.td}>
                                <Link
                                  href={`/${activity.urlName}`}
                                  target="_blank"
                                  className={styles.cardLink}
                                >
                                  /{activity.urlName} ↗
                                </Link>
                              </td>
                              <td className={styles.td}>
                                <div className={styles.tdStats}>
                                  <div>{stats?.participants || 0} participants</div>
                                  <div>{stats?.completedMappings || 0} mappings</div>
                                  <div>{stats?.comments || 0} comments</div>
                                </div>
                              </td>
                              <td className={styles.td}>
                                <span className={`${styles.badge} ${
                                  activity.isDraft
                                    ? styles.badgeDraft
                                    : activity.status === 'completed'
                                    ? styles.badgeCompleted
                                    : styles.badgeActive
                                }`}>
                                  {activity.isDraft ? 'Draft' : activity.status === 'completed' ? 'Completed' : 'Active'}
                                </span>
                              </td>
                              <td className={styles.td}>
                                <div className={styles.actions}>
                                  <button
                                    onClick={() => {
                                      setEditingActivity(activity);
                                      setShowCreateForm(true);
                                      router.push(`/admin?activity=${activity.id}`);
                                    }}
                                    className={`${styles.actionBtn} ${styles.actionEdit}`}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleToggleDraft(activity.id, activity.isDraft || false)}
                                    className={`${styles.actionBtn} ${styles.actionPublish}`}
                                  >
                                    {activity.isDraft ? 'Publish' : 'Unpublish'}
                                  </button>
                                  {activity.status !== 'completed' && (
                                    <button
                                      onClick={() => handleToggleComplete(activity.id)}
                                      className={`${styles.actionBtn} ${styles.actionComplete}`}
                                    >
                                      Complete
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDuplicateActivity(activity)}
                                    className={`${styles.actionBtn} ${styles.actionDuplicate}`}
                                  >
                                    Duplicate
                                  </button>
                                  <div className={styles.dropdown}>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === `desktop-${activity.id}` ? null : `desktop-${activity.id}`); }}
                                      className={`${styles.actionBtn} ${styles.actionJson}`}
                                    >
                                      JSON &#x25BE;
                                    </button>
                                    {openMenuId === `desktop-${activity.id}` && (
                                      <div className={styles.dropdownMenu} style={{ right: 0 }}>
                                        <button onClick={() => handleDownloadFullJSON(activity)} className={styles.dropdownItem}>
                                          Full Activity Data
                                        </button>
                                        <button onClick={() => handleDownloadStarterData(activity)} className={styles.dropdownItem}>
                                          Starter Data
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleDeleteActivity(activity.id)}
                                    className={`${styles.actionBtn} ${styles.actionDelete}`}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Main component with Suspense wrapper
export default function AdminPage() {
  return (
    <Suspense fallback={
      <div className={styles.loading}>Loading...</div>
    }>
      <AdminContent />
    </Suspense>
  );
}
