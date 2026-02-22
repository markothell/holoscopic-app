'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { UserService } from '@/services/userService';
import { UserSettings } from '@/models/User';
import UserMenu from '@/components/UserMenu';
import styles from './page.module.css';

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

  // Set body background
  useEffect(() => {
    document.body.style.background = '#F7F4EF';
    return () => {
      document.body.style.background = '';
    };
  }, []);

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
      <div className={styles.loading}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className={styles.container}>
      {/* Nav */}
      <div className={styles.navOuter}>
        <nav className={styles.nav}>
          <Link href="/" className={styles.navHome}>
            Holo<span>scopic</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <span className={styles.navLabel}>Settings</span>
            <UserMenu />
          </div>
        </nav>
      </div>

      <main className={styles.main}>
        {/* Page Title */}
        <div className={styles.pageTitle}>
          <h1>Settings</h1>
          <p>Manage your account preferences</p>
        </div>

        {/* Form */}
        <div className={styles.formCard}>
          {error && (
            <div className={`${styles.alert} ${styles.alertError}`}>
              {error}
            </div>
          )}

          {success && (
            <div className={`${styles.alert} ${styles.alertSuccess}`}>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Profile Information Section */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Profile</h2>

              <div className={styles.fieldGroup}>
                <div className={styles.field}>
                  <label htmlFor="name" className={styles.label}>
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className={styles.input}
                    disabled={saving}
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="email" className={styles.label}>
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className={styles.input}
                    disabled={saving}
                  />
                </div>
              </div>
            </div>

            {/* Notification Preferences Section */}
            <div className={`${styles.section} ${styles.sectionDivider}`}>
              <h2 className={styles.sectionTitle}>Notifications</h2>

              <div className={styles.checkboxGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={notifyNewActivities}
                    onChange={(e) => setNotifyNewActivities(e.target.checked)}
                    className={styles.checkbox}
                    disabled={saving}
                  />
                  <div className={styles.checkboxText}>
                    <div className={styles.checkboxTitle}>New Activities</div>
                    <p className={styles.checkboxDescription}>
                      Receive notifications when new activities are published
                    </p>
                  </div>
                </label>

                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={notifyEnrolledActivities}
                    onChange={(e) => setNotifyEnrolledActivities(e.target.checked)}
                    className={styles.checkbox}
                    disabled={saving}
                  />
                  <div className={styles.checkboxText}>
                    <div className={styles.checkboxTitle}>Enrolled Activities</div>
                    <p className={styles.checkboxDescription}>
                      Receive notifications about activities in your enrolled sequences
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Submit */}
            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className={`${styles.button} ${styles.buttonSecondary}`}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`${styles.button} ${styles.buttonPrimary}`}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <Link href="/" className={styles.footerLink}>Home</Link>
          <Link href="/dashboard" className={styles.footerLink}>Dashboard</Link>
          <a href="https://wiki.holoscopic.io" className={styles.footerLink}>Wiki</a>
        </div>
      </main>
    </div>
  );
}
