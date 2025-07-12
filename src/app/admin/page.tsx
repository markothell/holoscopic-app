'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { WeAllExplainActivity } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';
import { FormattingService } from '@/utils/formatting';
import AdminPanel from '@/components/AdminPanel';
import Link from 'next/link';

function AdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingActivityId = searchParams.get('activity');

  const [activities, setActivities] = useState<WeAllExplainActivity[]>([]);
  const [editingActivity, setEditingActivity] = useState<WeAllExplainActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Load activities and editing activity
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const activitiesData = await ActivityService.getActivities();
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
  }, [editingActivityId]);

  // Handle activity creation
  const handleActivityCreated = (activity: WeAllExplainActivity) => {
    setActivities(prev => [activity, ...prev]);
    setShowCreateForm(false);
    setEditingActivity(null);
    router.push(`/activity/${activity.id}`);
  };

  // Handle activity update
  const handleActivityUpdated = (activity: WeAllExplainActivity) => {
    setActivities(prev => 
      prev.map(a => a.id === activity.id ? activity : a)
    );
    setShowCreateForm(false);
    setEditingActivity(null);
    router.push(`/activity/${activity.id}`);
  };

  // Handle delete activity
  const handleDeleteActivity = async (activityId: string) => {
    if (!confirm('Are you sure you want to delete this activity? This action cannot be undone.')) {
      return;
    }

    try {
      await ActivityService.deleteActivity(activityId);
      setActivities(prev => prev.filter(a => a.id !== activityId));
    } catch (err) {
      console.error('Error deleting activity:', err);
      alert('Failed to delete activity. Please try again.');
    }
  };

  // Handle complete activity
  const handleCompleteActivity = async (activityId: string) => {
    if (!confirm('Are you sure you want to complete this activity? Participants will no longer be able to submit responses.')) {
      return;
    }

    try {
      const updatedActivity = await ActivityService.completeActivity(activityId);
      setActivities(prev => 
        prev.map(a => a.id === activityId ? updatedActivity : a)
      );
    } catch (err) {
      console.error('Error completing activity:', err);
      alert('Failed to complete activity. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Admin Panel</h1>
            <p className="text-gray-600 mt-2">Manage your collaborative mapping activities</p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Back to Home
          </Link>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Create/Edit Form */}
        {showCreateForm ? (
          <div className="mb-8">
            <AdminPanel
              editingActivity={editingActivity || undefined}
              onActivityCreated={handleActivityCreated}
              onActivityUpdated={handleActivityUpdated}
              onCancel={() => {
                setShowCreateForm(false);
                setEditingActivity(null);
                router.push('/admin');
              }}
            />
          </div>
        ) : (
          <div className="mb-8">
            <div className="flex justify-center">
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Create New Activity
              </button>
            </div>
          </div>
        )}

        {/* Activities List */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">Your Activities</h2>
          
          {activities.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-600 mb-2">No activities yet</h3>
              <p className="text-gray-500 mb-6">Create your first collaborative mapping activity to get started.</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Create Activity
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => (
                <ActivityRow
                  key={activity.id}
                  activity={activity}
                  onEdit={() => {
                    setEditingActivity(activity);
                    setShowCreateForm(true);
                  }}
                  onDelete={() => handleDeleteActivity(activity.id)}
                  onComplete={() => handleCompleteActivity(activity.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Activity Row Component
interface ActivityRowProps {
  activity: WeAllExplainActivity;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
}

function ActivityRow({ activity, onEdit, onDelete, onComplete }: ActivityRowProps) {
  const participantCount = activity.participants.length;
  const ratingCount = activity.ratings.length;
  const commentCount = activity.comments.length;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          {/* Status and Title */}
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-2 h-2 rounded-full ${activity.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
            <h3 className="text-lg font-semibold text-gray-800">{activity.title}</h3>
            <span className="text-xs text-gray-500 capitalize">{activity.status}</span>
          </div>

          {/* Map Question */}
          <p className="text-sm text-gray-600 mb-4">{activity.mapQuestion}</p>

          {/* Stats */}
          <div className="flex gap-6 text-sm text-gray-500">
            <span>{FormattingService.formatParticipantCount(participantCount)}</span>
            <span>{FormattingService.formatRatingCount(ratingCount)}</span>
            <span>{FormattingService.formatCommentCount(commentCount)}</span>
            <span>Created {FormattingService.formatTimestamp(activity.createdAt)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Link
            href={`/activity/${activity.id}`}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors"
          >
            View
          </Link>
          <button
            onClick={onEdit}
            className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 transition-colors"
          >
            Edit
          </button>
          {activity.status === 'active' && (
            <button
              onClick={onComplete}
              className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded text-sm hover:bg-yellow-200 transition-colors"
            >
              Complete
            </button>
          )}
          <button
            onClick={onDelete}
            className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    }>
      <AdminContent />
    </Suspense>
  );
}