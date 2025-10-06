'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

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

interface Sequence {
  id: string;
  title: string;
  urlName: string;
  description?: string;
}

interface UserProfile {
  id: string;
  displayName?: string;
  name?: string;
  email: string;
  bio?: string;
  createdAt: string;
  joinedSequences: Sequence[];
  participatedActivities: Activity[];
}

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const userId = params.userId as string;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canView, setCanView] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      try {
        // Check if this is a starter/sample data user
        if (userId.startsWith('starter_')) {
          setProfile({
            id: userId,
            displayName: 'Sample Data',
            name: 'Sample Data',
            email: '',
            bio: 'This is example data provided to illustrate the activity.',
            createdAt: new Date().toISOString(),
            joinedSequences: [],
            participatedActivities: []
          });
          setCanView(true);
          setLoading(false);
          return;
        }

        const response = await fetch(`/api/users/${userId}`);

        if (response.status === 403) {
          setError('You do not have permission to view this profile. Only sequence participants can view profiles.');
          setLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch profile');
        }

        const data = await response.json();
        setProfile(data);
        setCanView(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }

    if (userId) {
      fetchProfile();
    }
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] flex items-center justify-center">
        <div className="text-white/80">Loading profile...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-red-600 mb-4">{error}</div>
          <button
            onClick={() => router.back()}
            className="text-indigo-600 hover:text-indigo-800"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const isOwnProfile = session?.user?.id === userId;
  const displayName = profile.displayName || profile.name || 'Anonymous User';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              {/* Profile Icon */}
              <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-600">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{displayName}</h1>
                <p className="text-gray-500 text-sm">Member since {new Date(profile.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
            {isOwnProfile && (
              <Link
                href="/profile/edit"
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Edit Profile
              </Link>
            )}
          </div>

          {profile.bio && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Bio</h2>
              <p className="text-gray-600">{profile.bio}</p>
            </div>
          )}
        </div>

        {/* Joined Sequences */}
        {profile.joinedSequences && profile.joinedSequences.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Joined Sequences</h2>
            <div className="space-y-3">
              {profile.joinedSequences.map((sequence) => (
                <Link
                  key={sequence.id}
                  href={`/sequence/${sequence.urlName}`}
                  className="block p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                >
                  <h3 className="font-semibold text-gray-900">{sequence.title}</h3>
                  {sequence.description && (
                    <p className="text-sm text-gray-600 mt-1">{sequence.description}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Participated Activities */}
        {profile.participatedActivities && profile.participatedActivities.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Activity Participation</h2>
            <div className="space-y-4">
              {profile.participatedActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="p-4 border border-gray-200 rounded-lg"
                >
                  <h3 className="font-semibold text-gray-900 mb-2">{activity.title}</h3>
                  <div className="text-sm text-gray-500 mb-3">
                    {activity.xAxisLabel} × {activity.yAxisLabel}
                  </div>

                  {activity.userEntries && activity.userEntries.length > 0 && (
                    <div className="space-y-2">
                      {activity.userEntries.map((entry) => (
                        <div
                          key={entry.slotNumber}
                          className="bg-gray-50 p-3 rounded border border-gray-200"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-gray-500">
                              Slot {entry.slotNumber}
                            </span>
                            <span className="font-medium text-gray-900">{entry.objectName}</span>
                          </div>
                          {entry.x !== undefined && entry.y !== undefined && (
                            <div className="text-xs text-gray-600">
                              Position: ({entry.x.toFixed(1)}, {entry.y.toFixed(1)})
                            </div>
                          )}
                          {entry.comment && (
                            <div className="text-sm text-gray-700 mt-2 italic">
                              "{entry.comment}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty States */}
        {(!profile.joinedSequences || profile.joinedSequences.length === 0) &&
         (!profile.participatedActivities || profile.participatedActivities.length === 0) && (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center text-gray-500">
            {isOwnProfile ? (
              <>
                <p className="mb-4">You haven't joined any sequences or participated in any activities yet.</p>
                <Link
                  href="/dashboard"
                  className="text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Browse Sequences
                </Link>
              </>
            ) : (
              <p>This user hasn't participated in any activities yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
