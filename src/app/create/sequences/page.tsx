'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sequence } from '@/models/Sequence';
import { SequenceService } from '@/services/sequenceService';
import { FormattingService } from '@/utils/formatting';
import { useAuth } from '@/contexts/AuthContext';
import SequencePanel from '@/components/SequencePanel';
import UserMenu from '@/components/UserMenu';
import styles from '../page.module.css';

function SequenceAdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingSequenceId = searchParams.get('sequence');
  const { userId, isAuthenticated, isLoading: authLoading } = useAuth();

  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [editingSequence, setEditingSequence] = useState<Sequence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const hasAccess = isAuthenticated;

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = original; };
  }, []);

  // Load sequences and editing sequence
  useEffect(() => {
    if (!hasAccess || !userId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const sequencesData = await SequenceService.getAdminSequences(userId);
        setSequences(sequencesData);

        if (editingSequenceId) {
          const sequence = sequencesData.find(s => s.id === editingSequenceId);
          if (sequence) {
            setEditingSequence(sequence);
            setShowCreateForm(true);
          }
        }
      } catch (err) {
        setError('Failed to load sequences.');
        console.error('Error loading sequences:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [editingSequenceId, hasAccess, userId]);

  // Show loading while checking auth
  if (authLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  // Redirect unauthenticated users
  if (!hasAccess) {
    return (
      <div className={styles.denied}>
        <div className={styles.deniedCard}>
          <h1 className={styles.deniedTitle}>Sign in to create</h1>
          <p className={styles.deniedText}>
            You need to be signed in to access the Create panel.
          </p>
          <Link href="/login" className={styles.deniedLink}>
            Sign in &rarr;
          </Link>
        </div>
      </div>
    );
  }

  const handleDeleteSequence = async (id: string) => {
    if (!confirm('Are you sure you want to delete this sequence?')) {
      return;
    }

    try {
      await SequenceService.deleteSequence(id);
      setSequences(sequences.filter(s => s.id !== id));
    } catch (err) {
      console.error('Error deleting sequence:', err);
      alert('Failed to delete sequence');
    }
  };

  const handleStartSequence = async (id: string) => {
    if (!confirm('Start this sequence? This will open the first activity.')) {
      return;
    }

    try {
      const updated = await SequenceService.startSequence(id);
      setSequences(sequences.map(s => s.id === id ? updated : s));
    } catch (err) {
      console.error('Error starting sequence:', err);
      alert('Failed to start sequence');
    }
  };

  const handleOpenNextActivity = async (id: string) => {
    if (!confirm('Open the next activity in this sequence?')) {
      return;
    }

    try {
      const updated = await SequenceService.openNextActivity(id);
      setSequences(sequences.map(s => s.id === id ? updated : s));
    } catch (err) {
      console.error('Error opening next activity:', err);
      alert('Failed to open next activity');
    }
  };

  const handleCompleteSequence = async (id: string) => {
    if (!confirm('Mark this sequence as completed? This cannot be undone.')) {
      return;
    }

    try {
      const updated = await SequenceService.completeSequence(id);
      setSequences(sequences.map(s => s.id === id ? updated : s));
    } catch (err) {
      console.error('Error completing sequence:', err);
      alert('Failed to complete sequence');
    }
  };

  const handleSaveSequence = async (updatedSequence: Sequence) => {
    try {
      const sequencesData = await SequenceService.getAdminSequences(userId || undefined);
      setSequences(sequencesData);
    } catch (err) {
      console.error('Error reloading sequences:', err);
      if (editingSequence && editingSequence.id) {
        setSequences(sequences.map(s => s.id === updatedSequence.id ? updatedSequence : s));
      } else {
        setSequences([...sequences, updatedSequence]);
      }
    }

    setShowCreateForm(false);
    setEditingSequence(null);
    router.push('/create/sequences');
  };

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (error) {
    return (
      <div className={styles.loading}>
        <div style={{ textAlign: 'center' }}>
          <div className={styles.errorText}>{error}</div>
          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
            <button onClick={() => window.location.reload()} className={styles.secondaryBtn}>
              Retry
            </button>
            <button onClick={() => setShowCreateForm(true)} className={styles.primaryBtn}>
              Create First Sequence
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.wordmark}>
            Holo<span className={styles.wordmarkAccent}>scopic</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <span className={styles.pageLabel}>create</span>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {/* Page Title */}
        <h1 className={styles.pageTitle}>Create</h1>

        {/* Tabs */}
        <div className={styles.tabs}>
          <Link href="/create" className={styles.tab}>
            Activities
          </Link>
          <Link href="/create/sequences" className={`${styles.tab} ${styles.tabActive}`}>
            Sequences
          </Link>
        </div>

        {showCreateForm ? (
          <SequencePanel
            editingSequence={editingSequence || undefined}
            onSequenceCreated={handleSaveSequence}
            onSequenceUpdated={handleSaveSequence}
            onCancel={() => {
              setShowCreateForm(false);
              setEditingSequence(null);
              router.push('/create/sequences');
            }}
          />
        ) : (
          <div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Sequences</h2>
              <button onClick={() => setShowCreateForm(true)} className={styles.primaryBtn}>
                New Sequence
              </button>
            </div>

            {sequences.length === 0 ? (
              <div className={styles.empty}>
                No sequences yet. Create your first one!
              </div>
            ) : (
              <div className={styles.cardList}>
                {sequences.map(sequence => (
                  <div key={sequence.id} className={styles.card}>
                    <div className={styles.cardTop}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className={styles.cardTitle}>{sequence.title}</div>
                        <Link
                          href={`/sequence/${sequence.urlName}`}
                          target="_blank"
                          className={styles.cardLink}
                        >
                          /sequence/{sequence.urlName} ↗
                        </Link>
                        {sequence.description && (
                          <p style={{ fontSize: '0.9rem', color: '#6B6560', fontStyle: 'italic', marginTop: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sequence.description}
                          </p>
                        )}
                      </div>
                      <span className={`${styles.badge} ${
                        sequence.status === 'draft'
                          ? styles.badgeDraft
                          : sequence.status === 'completed'
                          ? styles.badgeCompleted
                          : styles.badgeActive
                      }`}>
                        {sequence.status}
                      </span>
                    </div>

                    <div className={styles.cardMeta}>
                      <span>{sequence.activities.length} activities</span>
                      <span>{sequence.members.length} members</span>
                      <span>{sequence.activities.filter(a => a.openedAt).length} opened</span>
                      <span>{FormattingService.formatTimestamp(sequence.createdAt)}</span>
                    </div>

                    <div className={styles.actions}>
                      <button
                        onClick={() => {
                          setEditingSequence(sequence);
                          setShowCreateForm(true);
                          router.push(`/create/sequences?sequence=${sequence.id}`);
                        }}
                        className={`${styles.actionBtn} ${styles.actionEdit}`}
                      >
                        Edit
                      </button>
                      {sequence.status === 'draft' && (
                        <>
                          <span className={styles.actionDot}>&middot;</span>
                          <button
                            onClick={() => handleStartSequence(sequence.id)}
                            className={`${styles.actionBtn} ${styles.actionStart}`}
                          >
                            Start
                          </button>
                        </>
                      )}
                      {sequence.status === 'active' && (
                        <>
                          <span className={styles.actionDot}>&middot;</span>
                          <button
                            onClick={() => handleOpenNextActivity(sequence.id)}
                            className={`${styles.actionBtn} ${styles.actionOpenNext}`}
                          >
                            Open Next
                          </button>
                          <span className={styles.actionDot}>&middot;</span>
                          <button
                            onClick={() => handleCompleteSequence(sequence.id)}
                            className={`${styles.actionBtn} ${styles.actionPublish}`}
                          >
                            Complete
                          </button>
                        </>
                      )}
                      <span className={styles.actionDot}>&middot;</span>
                      <button
                        onClick={() => handleDeleteSequence(sequence.id)}
                        className={`${styles.actionBtn} ${styles.actionDelete}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function SequenceAdminPage() {
  return (
    <Suspense fallback={
      <div className={styles.loading}>Loading...</div>
    }>
      <SequenceAdminContent />
    </Suspense>
  );
}
