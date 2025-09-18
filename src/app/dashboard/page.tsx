'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface EnrolledActivity {
  activityId: {
    _id: string;
    title: string;
    urlName: string;
    status: string;
    enrollmentDescription?: string;
  };
  enrolledAt: Date;
  status: string;
  completedSessions: Array<{
    sessionId: string;
    completedAt: Date;
    objectName: string;
  }>;
}

interface UserData {
  wikiUsername: string;
  email: string;
  role: string;
  profile?: {
    displayName?: string;
    bio?: string;
    interests?: string[];
  };
  stats?: {
    totalActivitiesCompleted: number;
    totalCommentsPosted: number;
    lastActiveAt?: Date;
  };
  enrolledActivities: EnrolledActivity[];
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated' && session?.user?.username) {
      fetchUserData();
    }
  }, [status, session, router]);

  const fetchUserData = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/users/${session?.user?.username}`);

      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const result = await response.json();
      if (result.success) {
        setUserData(result.data.user);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to load user data');
      console.error('Error fetching user data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDropActivity = async (activityId: string) => {
    if (!confirm('Are you sure you want to drop this activity?')) return;

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(
        `${apiUrl}/api/users/${session?.user?.username}/enroll/${activityId}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        fetchUserData(); // Refresh the data
      }
    } catch (err) {
      console.error('Error dropping activity:', err);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <Link href="/" className="mt-4 text-blue-600 hover:underline">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  const enrolledActivities = userData?.enrolledActivities.filter(e => e.status === 'enrolled') || [];
  const completedActivities = userData?.enrolledActivities.filter(e => e.status === 'completed') || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome, {userData?.profile?.displayName || session?.user?.username}!
              </h1>
              <p className="mt-2 text-gray-600">@{userData?.wikiUsername}</p>
              {userData?.profile?.bio && (
                <p className="mt-3 text-gray-700">{userData.profile.bio}</p>
              )}
            </div>
            <Link
              href="/dashboard/settings"
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              Edit Profile
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {enrolledActivities.length}
              </div>
              <div className="text-sm text-gray-600">Enrolled Activities</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {userData?.stats?.totalActivitiesCompleted || 0}
              </div>
              <div className="text-sm text-gray-600">Completed</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {userData?.stats?.totalCommentsPosted || 0}
              </div>
              <div className="text-sm text-gray-600">Comments Posted</div>
            </div>
          </div>
        </div>

        {/* Enrolled Activities */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Your Enrolled Activities</h2>

          {enrolledActivities.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">You haven't enrolled in any activities yet.</p>
              <Link
                href="/"
                className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Browse Activities
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {enrolledActivities.map((enrollment) => (
                <div key={enrollment.activityId._id} className="border rounded-lg p-4">
                  <h3 className="font-semibold text-lg mb-2">
                    {enrollment.activityId.title}
                  </h3>
                  {enrollment.activityId.enrollmentDescription && (
                    <p className="text-sm text-gray-600 mb-3">
                      {enrollment.activityId.enrollmentDescription}
                    </p>
                  )}
                  <div className="flex justify-between items-center">
                    <Link
                      href={`/${enrollment.activityId.urlName}`}
                      className="text-blue-600 hover:underline"
                    >
                      Go to Activity →
                    </Link>
                    <button
                      onClick={() => handleDropActivity(enrollment.activityId._id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Drop
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Enrolled {new Date(enrollment.enrolledAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Completed Activities */}
        {completedActivities.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Completed Activities</h2>
            <div className="space-y-3">
              {completedActivities.map((enrollment) => (
                <div key={enrollment.activityId._id} className="flex justify-between items-center py-3 border-b last:border-0">
                  <div>
                    <h3 className="font-medium">{enrollment.activityId.title}</h3>
                    <p className="text-sm text-gray-500">
                      {enrollment.completedSessions.length} session(s) completed
                    </p>
                  </div>
                  <Link
                    href={`/${enrollment.activityId.urlName}`}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    View Results →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}