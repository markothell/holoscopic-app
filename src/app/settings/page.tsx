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
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
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
            <span className="text-gray-400">settings</span>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-8">
        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white mb-2">Settings</h1>
          <p className="text-gray-500 text-sm">Manage your account preferences</p>
        </div>

        {/* Form */}
        <div className="bg-[#111827] border border-white/10 rounded-lg p-6">
          {error && (
            <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded px-4 py-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded px-4 py-3">
              <p className="text-emerald-400 text-sm">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Profile Information Section */}
            <div>
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Profile</h2>

              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm text-gray-400 mb-1.5">
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-3 py-2 bg-[#0a0f1a] border border-white/10 rounded text-white text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm text-gray-400 mb-1.5">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 bg-[#0a0f1a] border border-white/10 rounded text-white text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition"
                    disabled={saving}
                  />
                </div>
              </div>
            </div>

            {/* Notification Preferences Section */}
            <div className="pt-6 border-t border-white/10">
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Notifications</h2>

              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={notifyNewActivities}
                    onChange={(e) => setNotifyNewActivities(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-white/20 bg-[#0a0f1a] text-sky-500 focus:ring-sky-500 focus:ring-offset-0"
                    disabled={saving}
                  />
                  <div>
                    <span className="text-sm text-white group-hover:text-sky-400 transition-colors">New Activities</span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Receive notifications when new activities are published
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={notifyEnrolledActivities}
                    onChange={(e) => setNotifyEnrolledActivities(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-white/20 bg-[#0a0f1a] text-sky-500 focus:ring-sky-500 focus:ring-offset-0"
                    disabled={saving}
                  />
                  <div>
                    <span className="text-sm text-white group-hover:text-sky-400 transition-colors">Enrolled Activities</span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Receive notifications about activities in your enrolled sequences
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-6 border-t border-white/10">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-white/10 flex gap-6 text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-300">Home</Link>
          <Link href="/dashboard" className="hover:text-gray-300">Dashboard</Link>
          <a href="https://wiki.holoscopic.io" className="hover:text-gray-300">Wiki</a>
        </div>
      </main>
    </div>
  );
}
