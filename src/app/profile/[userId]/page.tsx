'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useAuth } from '@/contexts/AuthContext';
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
    async function fetchProfile() {
      try {
        // Require sequence context
        if (!sequenceId) {
          setError('Sequence context is required. Please access this profile from within a sequence.');
          setLoading(false);
          return;
        }

        // Check if this is a starter/sample data user
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

        const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
        const response = await fetch(`${API_URL}/api/sequences/${sequenceId}/profile/${targetUserId}?viewerId=${viewerId || ''}`);

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

  const isOwnProfile = viewerId === targetUserId;
  const displayName = profile.name || 'Anonymous';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Back to Sequence */}
        <div className="mb-4">
          <Link
            href={`/sequence/${profile.sequenceUrlName}`}
            className="text-white/80 hover:text-white text-sm flex items-center gap-2"
          >
            ← Back to {profile.sequenceTitle}
          </Link>
        </div>

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
                <p className="text-gray-500 text-sm">
                  {profile.sequenceTitle} • Joined {new Date(profile.joinedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </div>

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

        {/* Empty State */}
        {(!profile.participatedActivities || profile.participatedActivities.length === 0) && (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center text-gray-500">
            {isOwnProfile ? (
              <p>You haven't participated in any activities in this sequence yet.</p>
            ) : (
              <p>{displayName} hasn't participated in any activities in this sequence yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
