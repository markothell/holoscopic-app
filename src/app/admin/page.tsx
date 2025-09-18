'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HoloscopicActivity } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';
import { FormattingService } from '@/utils/formatting';
import { useAllAnalytics, type AnalyticsStats } from '@/hooks/useAnalytics';
import AdminPanel from '@/components/AdminPanel';
import Link from 'next/link';

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
        setError('Failed to load activities');
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

  // Password login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">Admin Access</h1>

          <form onSubmit={handlePasswordSubmit}>
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter admin password"
                autoFocus
              />
            </div>

            {authError && (
              <div className="mb-4 text-red-600 text-sm">
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
              className="text-sm text-gray-600 hover:text-gray-800"
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
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="text-center text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Holoscopic Admin</h1>
          <button
            onClick={() => {
              sessionStorage.removeItem('adminAuth');
              setIsAuthenticated(false);
            }}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
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
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-800">Activities</h2>
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
              >
                Create New Activity
              </button>
            </div>

            {activities.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                No activities yet. Create your first one!
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Title
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        URL
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Stats
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {activities.map(activity => {
                      const stats = getActivityStats(activity.id);

                      return (
                        <tr key={activity.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {activity.title}
                            </div>
                            <div className="text-sm text-gray-500">
                              Created {FormattingService.formatTimestamp(activity.createdAt)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Link
                              href={`/${activity.urlName}`}
                              target="_blank"
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              /{activity.urlName} ↗
                            </Link>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div>{stats?.participants || 0} participants</div>
                            <div>{stats?.completedMappings || 0} mappings</div>
                            <div>{stats?.comments || 0} comments</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {activity.isDraft && (
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                                Draft
                              </span>
                            )}
                            {activity.status === 'completed' && (
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 ml-2">
                                Completed
                              </span>
                            )}
                            {!activity.isDraft && activity.status === 'active' && (
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
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
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleToggleDraft(activity.id, activity.isDraft || false)}
                              className="text-yellow-600 hover:text-yellow-900"
                            >
                              {activity.isDraft ? 'Publish' : 'Draft'}
                            </button>
                            {activity.status !== 'completed' && (
                              <button
                                onClick={() => handleToggleComplete(activity.id)}
                                className="text-green-600 hover:text-green-900"
                              >
                                Complete
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteActivity(activity.id)}
                              className="text-red-600 hover:text-red-900"
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
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="text-center">Loading admin panel...</div>
      </div>
    }>
      <AdminContent />
    </Suspense>
  );
}