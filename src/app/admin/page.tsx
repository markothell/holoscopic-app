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
import Image from 'next/image';

function AdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingActivityId = searchParams.get('activity');
  const shouldShowCreate = searchParams.get('create') === 'true';
  const returnUrl = searchParams.get('returnUrl');
  const { userRole, isAuthenticated, isLoading: authLoading } = useAuth();

  const [activities, setActivities] = useState<HoloscopicActivity[]>([]);
  const [editingActivity, setEditingActivity] = useState<HoloscopicActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const { allStats, loading: analyticsLoading } = useAllAnalytics();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Check if user has admin role
  const hasAdminAccess = isAuthenticated && userRole === 'admin';

  // Load activities and editing activity
  useEffect(() => {
    if (!hasAdminAccess) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const activitiesData = await ActivityService.getAdminActivities();
        setActivities(activitiesData);

        if (editingActivityId) {
          const activity = activitiesData.find(a => a.id === editingActivityId);
          if (activity) {
            setEditingActivity(activity);
            setShowCreateForm(true);
          }
        } else if (shouldShowCreate) {
          // Open create form if ?create=true
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
  }, [editingActivityId, shouldShowCreate, hasAdminAccess]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Access denied screen
  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center">
          <Image
            src="/holoLogo_dark.svg"
            alt="Holoscopic"
            width={48}
            height={48}
            className="mx-auto mb-6"
          />
          <h1 className="text-xl font-semibold text-white mb-4">Admin Access Required</h1>
          <p className="text-gray-500 mb-6">
            You need administrator privileges to access this page.
          </p>
          <a href="/" className="text-sky-400 hover:underline text-sm">
            ← Back to home
          </a>
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
    // Create a duplicate with a new URL name
    const duplicatedActivity: Partial<HoloscopicActivity> = {
      ...activity,
      id: '', // Clear ID so a new one will be generated
      urlName: `${activity.urlName}-copy-${Date.now()}`, // Unique URL name
      title: `${activity.title} (Copy)`,
      isDraft: true, // Start as draft
      // Clear user data
      participants: [],
      ratings: [],
      comments: []
    };

    // Remove timestamps so they get regenerated
    delete duplicatedActivity.createdAt;
    delete duplicatedActivity.updatedAt;

    // Set this as the editing activity and show the form
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
    // Reload activities from server to ensure we have the latest data
    try {
      const activitiesData = await ActivityService.getAdminActivities();
      setActivities(activitiesData);
    } catch (err) {
      console.error('Error reloading activities:', err);
      // Fallback to local update if reload fails
      if (editingActivity && editingActivity.id) {
        // Update existing
        setActivities(activities.map(a =>
          a.id === updatedActivity.id ? updatedActivity : a
        ));
      } else {
        // Add new
        setActivities([...activities, updatedActivity]);
      }
    }

    setShowCreateForm(false);
    setEditingActivity(null);

    // If there's a return URL, close this window and navigate back
    if (returnUrl) {
      alert('Activity saved! You can now close this tab and return to the sequence editor.');
      // Optional: try to close the window if it was opened by window.open
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
    // Create a copy and sort comments by vote count (highest first)
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

  // Handle starter data JSON download (formatted for new activity)
  const handleDownloadStarterData = (activity: HoloscopicActivity) => {
    // Sort comments by vote count
    const sortedComments = [...(activity.comments || [])].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));

    // Find corresponding rating for each comment to get position
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
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-red-400 mb-4">{error}</div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors"
            >
              Create First Activity
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/holoLogo_dark.svg"
                alt="Holoscopic"
                width={28}
                height={28}
              />
              <span className="text-white font-semibold">Holoscopic</span>
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-gray-400">admin</span>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white mb-2">Admin</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-white/10 mb-6">
          <Link
            href="/admin"
            className="pb-3 text-sm font-medium text-white border-b-2 border-sky-500 -mb-px"
          >
            Activities
          </Link>
          <Link
            href="/admin/sequences"
            className="pb-3 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-gray-300 -mb-px"
          >
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
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-medium text-white">Activities</h2>
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors"
              >
                New Activity
              </button>
            </div>

            {activities.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No activities yet. Create your first one!
              </div>
            ) : (
              <>
                {/* Mobile View - Cards */}
                <div className="lg:hidden space-y-3">
                  {activities.map(activity => {
                    const stats = getActivityStats(activity.id);
                    return (
                      <div key={activity.id} className="bg-[#111827] border border-white/10 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-white font-medium truncate">{activity.title}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                <ActivityTypeIcon type={activity.activityType} size={14} />
                                {getActivityTypeLabel(activity.activityType)}
                              </span>
                              <Link
                                href={`/${activity.urlName}`}
                                target="_blank"
                                className="text-xs text-sky-400 hover:underline"
                              >
                                /{activity.urlName} ↗
                              </Link>
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${
                            activity.isDraft
                              ? 'bg-gray-800 text-gray-400'
                              : activity.status === 'completed'
                              ? 'bg-gray-800 text-gray-400'
                              : 'bg-emerald-900/50 text-emerald-400'
                          }`}>
                            {activity.isDraft ? 'Draft' : activity.status === 'completed' ? 'Completed' : 'Active'}
                          </span>
                        </div>

                        <div className="text-xs text-gray-500 mb-3 flex gap-3">
                          <span>{stats?.participants || 0} participants</span>
                          <span>{stats?.completedMappings || 0} mappings</span>
                          <span>{stats?.comments || 0} comments</span>
                        </div>

                        <div className="flex flex-wrap gap-2 text-xs">
                          <button
                            onClick={() => {
                              setEditingActivity(activity);
                              setShowCreateForm(true);
                              router.push(`/admin?activity=${activity.id}`);
                            }}
                            className="text-sky-400 hover:underline"
                          >
                            Edit
                          </button>
                          <span className="text-gray-600">·</span>
                          <button
                            onClick={() => handleToggleDraft(activity.id, activity.isDraft || false)}
                            className="text-yellow-400 hover:underline"
                          >
                            {activity.isDraft ? 'Publish' : 'Unpublish'}
                          </button>
                          <span className="text-gray-600">·</span>
                          <button
                            onClick={() => handleDuplicateActivity(activity)}
                            className="text-violet-400 hover:underline"
                          >
                            Duplicate
                          </button>
                          <span className="text-gray-600">·</span>
                          <div className="relative inline-block">
                            <button
                              onClick={() => setOpenMenuId(openMenuId === activity.id ? null : activity.id)}
                              className="text-gray-400 hover:underline"
                            >
                              JSON ▾
                            </button>
                            {openMenuId === activity.id && (
                              <div className="absolute z-10 mt-1 w-48 bg-[#1f2937] border border-white/10 rounded shadow-lg">
                                <button
                                  onClick={() => handleDownloadFullJSON(activity)}
                                  className="block w-full text-left px-3 py-2 text-xs text-white hover:bg-white/5"
                                >
                                  Full Activity Data
                                </button>
                                <button
                                  onClick={() => handleDownloadStarterData(activity)}
                                  className="block w-full text-left px-3 py-2 text-xs text-white hover:bg-white/5"
                                >
                                  Starter Data
                                </button>
                              </div>
                            )}
                          </div>
                          <span className="text-gray-600">·</span>
                          <button
                            onClick={() => handleDeleteActivity(activity.id)}
                            className="text-red-400 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop View - Table */}
                <div className="hidden lg:block border border-white/10 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-white/5">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Title
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            URL
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Stats
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {activities.map(activity => {
                          const stats = getActivityStats(activity.id);

                          return (
                            <tr key={activity.id} className="hover:bg-white/5">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm text-white">
                                  {activity.title}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                  <span className="flex items-center gap-1">
                                    <ActivityTypeIcon type={activity.activityType} size={12} />
                                    {getActivityTypeLabel(activity.activityType)}
                                  </span>
                                  <span>·</span>
                                  <span>{FormattingService.formatTimestamp(activity.createdAt)}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <Link
                                  href={`/${activity.urlName}`}
                                  target="_blank"
                                  className="text-sm text-sky-400 hover:underline"
                                >
                                  /{activity.urlName} ↗
                                </Link>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                                <div>{stats?.participants || 0} participants</div>
                                <div>{stats?.completedMappings || 0} mappings</div>
                                <div>{stats?.comments || 0} comments</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  activity.isDraft
                                    ? 'bg-gray-800 text-gray-400'
                                    : activity.status === 'completed'
                                    ? 'bg-gray-800 text-gray-400'
                                    : 'bg-emerald-900/50 text-emerald-400'
                                }`}>
                                  {activity.isDraft ? 'Draft' : activity.status === 'completed' ? 'Completed' : 'Active'}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs space-x-3">
                                <button
                                  onClick={() => {
                                    setEditingActivity(activity);
                                    setShowCreateForm(true);
                                    router.push(`/admin?activity=${activity.id}`);
                                  }}
                                  className="text-sky-400 hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleToggleDraft(activity.id, activity.isDraft || false)}
                                  className="text-yellow-400 hover:underline"
                                >
                                  {activity.isDraft ? 'Publish' : 'Unpublish'}
                                </button>
                                {activity.status !== 'completed' && (
                                  <button
                                    onClick={() => handleToggleComplete(activity.id)}
                                    className="text-emerald-400 hover:underline"
                                  >
                                    Complete
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDuplicateActivity(activity)}
                                  className="text-violet-400 hover:underline"
                                >
                                  Duplicate
                                </button>
                                <div className="relative inline-block">
                                  <button
                                    onClick={() => setOpenMenuId(openMenuId === `desktop-${activity.id}` ? null : `desktop-${activity.id}`)}
                                    className="text-gray-400 hover:underline"
                                  >
                                    JSON ▾
                                  </button>
                                  {openMenuId === `desktop-${activity.id}` && (
                                    <div className="absolute z-10 mt-1 w-48 bg-[#1f2937] border border-white/10 rounded shadow-lg right-0">
                                      <button
                                        onClick={() => handleDownloadFullJSON(activity)}
                                        className="block w-full text-left px-3 py-2 text-xs text-white hover:bg-white/5"
                                      >
                                        Full Activity Data
                                      </button>
                                      <button
                                        onClick={() => handleDownloadStarterData(activity)}
                                        className="block w-full text-left px-3 py-2 text-xs text-white hover:bg-white/5"
                                      >
                                        Starter Data
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleDeleteActivity(activity.id)}
                                  className="text-red-400 hover:underline"
                                >
                                  Delete
                                </button>
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
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    }>
      <AdminContent />
    </Suspense>
  );
}