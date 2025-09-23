'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HoloscopicActivity } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';
import { FormattingService } from '@/utils/formatting';
import { useAllAnalytics, type AnalyticsStats } from '@/hooks/useAnalytics';
import AdminPanel from '@/components/AdminPanel';
import Link from 'next/link';
import Image from 'next/image';

function AdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingActivityId = searchParams.get('activity');

  const [activities, setActivities] = useState<HoloscopicActivity[]>([]);
  const [editingActivity, setEditingActivity] = useState<HoloscopicActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const { allStats, loading: analyticsLoading } = useAllAnalytics();

  // Password protection state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Check if already authenticated (from session storage)
  useEffect(() => {
    const authStatus = sessionStorage.getItem('adminAuth');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Load activities and editing activity
  useEffect(() => {
    if (!isAuthenticated) return;

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
        }
      } catch (err) {
        setError('Failed to load activities. The backend server may not be running.');
        console.error('Error loading activities:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [editingActivityId, isAuthenticated]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Check password against environment variable
    // You'll set NEXT_PUBLIC_ADMIN_PASSWORD in Vercel
    const correctPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'holoscopic2024';

    if (password === correctPassword) {
      setIsAuthenticated(true);
      sessionStorage.setItem('adminAuth', 'true');
      setAuthError('');
    } else {
      setAuthError('Incorrect password');
    }
  };

  // Password login screen - Dark theme
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800 rounded-lg shadow-xl p-6 sm:p-8">
          <div className="flex justify-center mb-6">
            <Image
              src="/holoLogo_dark.svg"
              alt="Holoscopic Logo"
              width={60}
              height={60}
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-6 text-center">Admin Access</h1>

          <form onSubmit={handlePasswordSubmit}>
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                placeholder="Enter admin password"
                autoFocus
              />
            </div>

            {authError && (
              <div className="mb-4 text-red-400 text-sm">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
            >
              Access Admin Panel
            </button>
          </form>

          <div className="mt-6 text-center">
            <a
              href="/"
              className="text-sm text-gray-400 hover:text-gray-300"
            >
              ← Back to Home
            </a>
          </div>
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
      comments: [],
      emails: []
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
    if (editingActivity) {
      // Update existing
      setActivities(activities.map(a =>
        a.id === updatedActivity.id ? updatedActivity : a
      ));
    } else {
      // Add new
      setActivities([...activities, updatedActivity]);
    }

    setShowCreateForm(false);
    setEditingActivity(null);
    router.push('/admin');
  };

  // Get statistics for an activity
  const getActivityStats = (activityId: string): AnalyticsStats | null => {
    if (analyticsLoading || !allStats) return null;
    return allStats[activityId] || null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-8">
        <div className="text-center text-gray-300">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-red-400 mb-4 text-sm sm:text-base">{error}</div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 sm:px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 sm:px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
            >
              Create First Activity
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
            <Image
              src="/holoLogo_dark.svg"
              alt="Holoscopic Logo"
              width={32}
              height={32}
              className="mr-2 sm:mr-3 sm:w-10 sm:h-10"
            />
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Holoscopic Admin</h1>
          </Link>
          <button
            onClick={() => {
              sessionStorage.removeItem('adminAuth');
              setIsAuthenticated(false);
            }}
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-400 hover:text-gray-300"
          >
            Logout
          </button>
        </div>

        {showCreateForm ? (
          <AdminPanel
            editingActivity={editingActivity || undefined}
            onActivityCreated={handleSaveActivity}
            onActivityUpdated={handleSaveActivity}
            onCancel={() => {
              setShowCreateForm(false);
              setEditingActivity(null);
              router.push('/admin');
            }}
          />
        ) : (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white">Activities</h2>
              <button
                onClick={() => setShowCreateForm(true)}
                className="w-full sm:w-auto px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors text-sm sm:text-base"
              >
                Create New Activity
              </button>
            </div>

            {activities.length === 0 ? (
              <div className="bg-slate-800 rounded-lg shadow-xl p-6 sm:p-8 text-center text-gray-400">
                No activities yet. Create your first one!
              </div>
            ) : (
              <>
                {/* Mobile View - Cards */}
                <div className="lg:hidden space-y-4">
                  {activities.map(activity => {
                    const stats = getActivityStats(activity.id);
                    return (
                      <div key={activity.id} className="bg-slate-800 rounded-lg shadow-xl p-4">
                        {/* Title and Status */}
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="text-white font-medium text-base">{activity.title}</h3>
                            <Link
                              href={`/${activity.urlName}`}
                              target="_blank"
                              className="text-xs text-blue-400 hover:text-blue-300"
                            >
                              /{activity.urlName} ↗
                            </Link>
                            <div className="text-xs text-gray-400 mt-1">
                              {FormattingService.formatTimestamp(activity.createdAt)}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 ml-2">
                            {activity.isDraft && (
                              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-700 text-gray-300">
                                Draft
                              </span>
                            )}
                            {activity.status === 'completed' && (
                              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-900 text-green-300">
                                Completed
                              </span>
                            )}
                            {!activity.isDraft && activity.status === 'active' && (
                              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-900 text-blue-300">
                                Active
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="text-xs text-gray-400 mb-3 flex gap-3">
                          <span>{stats?.participants || 0} participants</span>
                          <span>{stats?.completedMappings || 0} mappings</span>
                          <span>{stats?.comments || 0} comments</span>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => {
                              setEditingActivity(activity);
                              setShowCreateForm(true);
                              router.push(`/admin?activity=${activity.id}`);
                            }}
                            className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleDraft(activity.id, activity.isDraft || false)}
                            className="px-3 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded"
                          >
                            {activity.isDraft ? 'Publish' : 'Draft'}
                          </button>
                          {activity.status !== 'completed' && (
                            <button
                              onClick={() => handleToggleComplete(activity.id)}
                              className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
                            >
                              Complete
                            </button>
                          )}
                          <button
                            onClick={() => handleDuplicateActivity(activity)}
                            className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded"
                          >
                            Duplicate
                          </button>
                          <button
                            onClick={() => handleDeleteActivity(activity.id)}
                            className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop View - Table */}
                <div className="hidden lg:block bg-slate-800 rounded-lg shadow-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-700">
                      <thead className="bg-slate-900">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Title
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            URL
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Stats
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-slate-800 divide-y divide-slate-700">
                        {activities.map(activity => {
                          const stats = getActivityStats(activity.id);

                          return (
                            <tr key={activity.id}>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-white">
                                  {activity.title}
                                </div>
                                <div className="text-sm text-gray-400">
                                  Created {FormattingService.formatTimestamp(activity.createdAt)}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <Link
                                  href={`/${activity.urlName}`}
                                  target="_blank"
                                  className="text-sm text-blue-400 hover:text-blue-300"
                                >
                                  /{activity.urlName} ↗
                                </Link>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                <div>{stats?.participants || 0} participants</div>
                                <div>{stats?.completedMappings || 0} mappings</div>
                                <div>{stats?.comments || 0} comments</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {activity.isDraft && (
                                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-700 text-gray-300">
                                    Draft
                                  </span>
                                )}
                                {activity.status === 'completed' && (
                                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900 text-green-300 ml-2">
                                    Completed
                                  </span>
                                )}
                                {!activity.isDraft && activity.status === 'active' && (
                                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-900 text-blue-300">
                                    Active
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                <button
                                  onClick={() => {
                                    setEditingActivity(activity);
                                    setShowCreateForm(true);
                                    router.push(`/admin?activity=${activity.id}`);
                                  }}
                                  className="text-indigo-400 hover:text-indigo-300"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleToggleDraft(activity.id, activity.isDraft || false)}
                                  className="text-yellow-400 hover:text-yellow-300"
                                >
                                  {activity.isDraft ? 'Publish' : 'Draft'}
                                </button>
                                {activity.status !== 'completed' && (
                                  <button
                                    onClick={() => handleToggleComplete(activity.id)}
                                    className="text-green-400 hover:text-green-300"
                                  >
                                    Complete
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDuplicateActivity(activity)}
                                  className="text-purple-400 hover:text-purple-300"
                                >
                                  Duplicate
                                </button>
                                <button
                                  onClick={() => handleDeleteActivity(activity.id)}
                                  className="text-red-400 hover:text-red-300"
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
      </div>
    </div>
  );
}

// Main component with Suspense wrapper
export default function AdminPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-8">
        <div className="text-center text-gray-300">Loading admin panel...</div>
      </div>
    }>
      <AdminContent />
    </Suspense>
  );
}