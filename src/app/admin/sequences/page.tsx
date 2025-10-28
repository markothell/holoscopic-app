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
        setError('Failed to load sequences. The backend server may not be running.');
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
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] flex items-center justify-center p-4">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  // Access denied screen
  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800 rounded-lg shadow-xl p-6 sm:p-8">
          <div className="flex justify-center mb-6">
            <Image src="/holoLogo_dark.svg" alt="Holoscopic Logo" width={60} height={60} />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-6 text-center">Admin Access Required</h1>

          <p className="text-gray-300 text-center mb-6">
            You need administrator privileges to access this page.
          </p>

          <div className="text-center">
            <Link href="/admin" className="text-sm text-gray-400 hover:text-gray-300">
              ← Back to Admin
            </Link>
          </div>
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

  const getStatusBadge = (sequence: Sequence) => {
    if (sequence.status === 'draft') {
      return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-700 text-gray-300">Draft</span>;
    }
    if (sequence.status === 'completed') {
      return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-900 text-red-300">Completed</span>;
    }
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-900 text-green-300">Active</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] p-4 sm:p-8">
        <div className="text-center text-gray-300">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] p-4 sm:p-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-red-400 mb-4 text-sm sm:text-base">{error}</div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 sm:px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 sm:px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
            >
              Create First Sequence
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55]">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
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
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Admin</h1>
            </div>
            <div className="ml-auto">
              <UserMenu />
            </div>
          </div>

          {/* Toggle between Activities and Sequences */}
          <div className="flex gap-2 border-b border-slate-700">
            <Link
              href="/admin"
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-slate-600"
            >
              Activities
            </Link>
            <Link
              href="/admin/sequences"
              className="px-4 py-2 text-sm font-medium text-white border-b-2 border-blue-500"
            >
              Sequences
            </Link>
          </div>
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
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h2 className="text-lg sm:text-xl font-semibold text-white">Sequences</h2>
              <button
                onClick={() => setShowCreateForm(true)}
                className="w-full sm:w-auto px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors text-sm sm:text-base"
              >
                Create New Sequence
              </button>
            </div>

            {sequences.length === 0 ? (
              <div className="bg-slate-800 rounded-lg shadow-xl p-6 sm:p-8 text-center text-gray-400">
                No sequences yet. Create your first one!
              </div>
            ) : (
              <div className="space-y-4">
                {sequences.map(sequence => (
                  <div key={sequence.id} className="bg-slate-800 rounded-lg shadow-xl p-4 sm:p-6">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h3 className="text-white font-medium text-lg">{sequence.title}</h3>
                        <Link
                          href={`/sequence/${sequence.urlName}`}
                          target="_blank"
                          className="text-sm text-blue-400 hover:text-blue-300"
                        >
                          /sequence/{sequence.urlName} ↗
                        </Link>
                        {sequence.description && (
                          <p className="text-sm text-gray-400 mt-1">{sequence.description}</p>
                        )}
                        <div className="text-xs text-gray-400 mt-1">
                          Created {FormattingService.formatTimestamp(sequence.createdAt)}
                        </div>
                      </div>
                      {getStatusBadge(sequence)}
                    </div>

                    <div className="text-sm text-gray-400 mb-3 flex gap-4">
                      <span>{sequence.activities.length} activities</span>
                      <span>{sequence.members.length} members</span>
                      <span>{sequence.activities.filter(a => a.openedAt).length} opened</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setEditingSequence(sequence);
                          setShowCreateForm(true);
                          router.push(`/admin/sequences?sequence=${sequence.id}`);
                        }}
                        className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded"
                      >
                        Edit
                      </button>
                      {sequence.status === 'draft' && (
                        <button
                          onClick={() => handleStartSequence(sequence.id)}
                          className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
                        >
                          Start Sequence
                        </button>
                      )}
                      {sequence.status === 'active' && (
                        <>
                          <button
                            onClick={() => handleOpenNextActivity(sequence.id)}
                            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                          >
                            Open Next Activity
                          </button>
                          <button
                            onClick={() => handleCompleteSequence(sequence.id)}
                            className="px-3 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded"
                          >
                            Complete Sequence
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDeleteSequence(sequence.id)}
                        className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
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
      </div>
    </div>
  );
}

export default function SequenceAdminPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] p-4 sm:p-8">
        <div className="text-center text-gray-300">Loading admin panel...</div>
      </div>
    }>
      <SequenceAdminContent />
    </Suspense>
  );
}