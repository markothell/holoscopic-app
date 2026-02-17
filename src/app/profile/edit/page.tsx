'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import styles from './page.module.css';

export default function EditProfilePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [formData, setFormData] = useState({
    name: '',
    bio: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = ''; };
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    async function fetchProfile() {
      try {
        if (!session?.user?.id) return;

        const response = await fetch(`/api/users/${session.user.id}`);
        if (!response.ok) throw new Error('Failed to fetch profile');

        const data = await response.json();
        setFormData({
          name: data.name || '',
          bio: data.bio || ''
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }

    if (session?.user?.id) {
      fetchProfile();
    }
  }, [session, status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/users/update-profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/profile/${session?.user?.id}`);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.grain} />

      <div className={styles.container}>
        <nav className={styles.nav}>
          <Link href="/" className={styles.wordmark}>
            Holo<span>scopic</span>
          </Link>
          <div className={styles.navRight}>
            <span className={styles.navLabel}>Edit Profile</span>
            <UserMenu />
          </div>
        </nav>

        <div className={styles.header}>
          <h1 className={styles.title}>Edit Profile</h1>
          <p className={styles.subtitle}>Update your public information</p>
        </div>

        <div className={styles.divider} />

        <div className={styles.formCard}>
          {error && (
            <div className={`${styles.alert} ${styles.alertError}`}>
              {error}
            </div>
          )}

          {success && (
            <div className={`${styles.alert} ${styles.alertSuccess}`}>
              Profile updated successfully! Redirecting...
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label htmlFor="name" className={styles.label}>Name</label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                maxLength={50}
                className={styles.input}
                placeholder="Your name"
                disabled={saving}
              />
              <p className={styles.charCount}>{formData.name.length}/50</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="bio" className={styles.label}>Bio</label>
              <textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                maxLength={500}
                rows={6}
                className={styles.textarea}
                placeholder="Tell others about yourself..."
                disabled={saving}
              />
              <p className={styles.charCount}>{formData.bio.length}/500</p>
            </div>

            <div className={styles.actions}>
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

        <footer className={styles.footer}>
          <Link href="/" className={styles.footerLink}>Home</Link>
          <Link href="/dashboard" className={styles.footerLink}>Dashboard</Link>
          <a href="https://wiki.holoscopic.io" className={styles.footerLink}>Wiki</a>
        </footer>
      </div>
    </div>
  );
}
