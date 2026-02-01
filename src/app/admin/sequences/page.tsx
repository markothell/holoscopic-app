'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Sequence } from '@/models/Sequence';
import { SequenceService } from '@/services/sequenceService';
import { FormattingService } from '@/utils/formatting';
import { useAuth } from '@/contexts/AuthContext';
import SequencePanel from '@/components/SequencePanel';
import UserMenu from '@/components/UserMenu';

function SequenceAdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingSequenceId = searchParams.get('sequence');
  const { userRole, isAuthenticated, isLoading: authLoading } = useAuth();

  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [editingSequence, setEditingSequence] = useState<Sequence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Check if user has admin role
  const hasAdminAccess = isAuthenticated && userRole === 'admin';

  // Load sequences and editing sequence
  useEffect(() => {
    if (!hasAdminAccess) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const sequencesData = await SequenceService.getAdminSequences();
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
  }, [editingSequenceId, hasAdminAccess]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Access denied screen
  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center">
          <Image src="/holoLogo_dark.svg" alt="Holoscopic" width={48} height={48} className="mx-auto mb-6" />
          <h1 className="text-xl font-semibold text-white mb-4">Admin Access Required</h1>
          <p className="text-gray-500 mb-6">
            You need administrator privileges to access this page.
          </p>
          <Link href="/admin" className="text-sky-400 hover:underline text-sm">
            ← Back to Admin
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
      const sequencesData = await SequenceService.getAdminSequences();
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
    router.push('/admin/sequences');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-red-400 mb-4">{error}</div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors"
            >
              Create First Sequence
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
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
            <span className="text-gray-400">admin</span>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white mb-2">Admin</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-white/10 mb-6">
          <Link
            href="/admin"
            className="pb-3 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-gray-300 -mb-px"
          >
            Activities
          </Link>
          <Link
            href="/admin/sequences"
            className="pb-3 text-sm font-medium text-white border-b-2 border-sky-500 -mb-px"
          >
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
              router.push('/admin/sequences');
            }}
          />
        ) : (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-medium text-white">Sequences</h2>
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors"
              >
                New Sequence
              </button>
            </div>

            {sequences.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No sequences yet. Create your first one!
              </div>
            ) : (
              <div className="space-y-2">
                {sequences.map(sequence => (
                  <div key={sequence.id} className="bg-[#111827] border border-white/10 rounded-lg p-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium">{sequence.title}</h3>
                        <Link
                          href={`/sequence/${sequence.urlName}`}
                          target="_blank"
                          className="text-xs text-sky-400 hover:underline"
                        >
                          /sequence/{sequence.urlName} ↗
                        </Link>
                        {sequence.description && (
                          <p className="text-sm text-gray-500 mt-1 truncate">{sequence.description}</p>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                        sequence.status === 'draft'
                          ? 'bg-gray-800 text-gray-400'
                          : sequence.status === 'completed'
                          ? 'bg-gray-800 text-gray-400'
                          : 'bg-emerald-900/50 text-emerald-400'
                      }`}>
                        {sequence.status}
                      </span>
                    </div>

                    <div className="text-xs text-gray-500 mb-3 flex gap-4">
                      <span>{sequence.activities.length} activities</span>
                      <span>{sequence.members.length} members</span>
                      <span>{sequence.activities.filter(a => a.openedAt).length} opened</span>
                      <span>{FormattingService.formatTimestamp(sequence.createdAt)}</span>
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs">
                      <button
                        onClick={() => {
                          setEditingSequence(sequence);
                          setShowCreateForm(true);
                          router.push(`/admin/sequences?sequence=${sequence.id}`);
                        }}
                        className="text-sky-400 hover:underline"
                      >
                        Edit
                      </button>
                      {sequence.status === 'draft' && (
                        <button
                          onClick={() => handleStartSequence(sequence.id)}
                          className="text-emerald-400 hover:underline"
                        >
                          Start
                        </button>
                      )}
                      {sequence.status === 'active' && (
                        <>
                          <button
                            onClick={() => handleOpenNextActivity(sequence.id)}
                            className="text-violet-400 hover:underline"
                          >
                            Open Next
                          </button>
                          <button
                            onClick={() => handleCompleteSequence(sequence.id)}
                            className="text-yellow-400 hover:underline"
                          >
                            Complete
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDeleteSequence(sequence.id)}
                        className="text-red-400 hover:underline"
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
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    }>
      <SequenceAdminContent />
    </Suspense>
  );
}
