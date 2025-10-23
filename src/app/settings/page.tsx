'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { UserService } from '@/services/userService';
import { UserSettings } from '@/models/User';
import UserMenu from '@/components/UserMenu';

export default function SettingsPage() {
  const router = useRouter();
  const { userId, isAuthenticated, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notifyNewActivities, setNotifyNewActivities] = useState(true);
  const [notifyEnrolledActivities, setNotifyEnrolledActivities] = useState(true);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?callbackUrl=/settings');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load user settings
  useEffect(() => {
    if (!userId) return;

    const loadSettings = async () => {
      try {
        setLoading(true);
        const settings = await UserService.getUserSettings(userId);
        setName(settings.name || '');
        setEmail(settings.email || '');
        setNotifyNewActivities(settings.notifications?.newActivities ?? true);
        setNotifyEnrolledActivities(settings.notifications?.enrolledActivities ?? true);
      } catch (err) {
        console.error('Error loading settings:', err);
        setError('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      await UserService.updateUserSettings(userId, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        notifications: {
          newActivities: notifyNewActivities,
          enrolledActivities: notifyEnrolledActivities,
        },
      });

      setSuccess('Settings saved successfully!');

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] flex items-center justify-center">
        <div className="text-white/80">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55]">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/">
                <Image
                  src="/holoLogo_dark.svg"
                  alt="Holoscopic Logo"
                  width={32}
                  height={32}
                  className="sm:w-10 sm:h-10 hover:opacity-80 transition-opacity"
                />
              </Link>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Settings</h1>
            </div>
            <UserMenu />
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-2xl mx-auto">
          <div className="bg-slate-800 rounded-lg shadow-xl p-6 sm:p-8">
            {error && (
            <div className="mb-6 bg-red-500/10 border border-red-500/50 rounded-lg p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 bg-green-500/10 border border-green-500/50 rounded-lg p-4">
              <p className="text-green-400 text-sm">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Profile Information Section */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Profile Information</h2>

              {/* Name Field */}
              <div className="mb-4">
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  disabled={saving}
                />
              </div>

              {/* Email Field */}
              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="your@email.com"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Notification Preferences Section */}
            <div className="border-t border-slate-700 pt-6">
              <h2 className="text-lg font-semibold text-white mb-4">Notification Preferences</h2>

              {/* New Activities Checkbox */}
              <div className="mb-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyNewActivities}
                    onChange={(e) => setNotifyNewActivities(e.target.checked)}
                    className="mt-1 w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
                    disabled={saving}
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-300">New Activities</span>
                    <p className="text-xs text-gray-400 mt-1">
                      Receive notifications when new activities are published
                    </p>
                  </div>
                </label>
              </div>

              {/* Enrolled Activities Checkbox */}
              <div className="mb-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyEnrolledActivities}
                    onChange={(e) => setNotifyEnrolledActivities(e.target.checked)}
                    className="mt-1 w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
                    disabled={saving}
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-300">Enrolled Activities</span>
                    <p className="text-xs text-gray-400 mt-1">
                      Receive notifications about activities in your enrolled sequences
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-6 border-t border-slate-700">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="px-6 py-2 text-sm text-gray-300 hover:text-white transition"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
          </div>
        </main>
      </div>
    </div>
  );
}
