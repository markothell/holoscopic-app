'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Sequence } from '@/models/Sequence';
import { SequenceService } from '@/services/sequenceService';
import { FormattingService } from '@/utils/formatting';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';

export default function DashboardPage() {
  const router = useRouter();
  const { userId, isLoading: authLoading } = useAuth();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user's sequences
  useEffect(() => {
    if (!userId) return;

    const loadSequences = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await SequenceService.getUserSequences(userId);
        setSequences(data);
      } catch (err) {
        setError('Failed to load sequences. The backend server may not be running.');
        console.error('Error loading sequences:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSequences();
  }, [userId]);

  // Calculate activity stats for a sequence
  const getSequenceStats = (sequence: Sequence) => {
    const total = sequence.activities.length;
    const participated = sequence.activities.filter(a => a.hasParticipated).length;
    const opened = sequence.activities.filter(a => a.openedAt).length;
    const closed = sequence.activities.filter(a =>
      a.closedAt && new Date() > new Date(a.closedAt)
    ).length;

    return { total, participated, opened, closed };
  };

  // Get status badge for sequence
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
          <button
            onClick={() => window.location.reload()}
            className="px-4 sm:px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55]">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8 flex justify-between items-center">
          <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
            <Image
              src="/holoLogo_dark.svg"
              alt="Holoscopic Logo"
              width={32}
              height={32}
              className="mr-2 sm:mr-3 sm:w-10 sm:h-10"
            />
            <h1 className="text-2xl sm:text-3xl font-bold text-white">My Sequences</h1>
          </Link>
          <UserMenu />
        </div>

        {/* Sequences List */}
        {sequences.length === 0 ? (
          <div className="bg-slate-800 rounded-lg shadow-xl p-6 sm:p-8 text-center text-gray-400">
            <p className="mb-4">You're not enrolled in any sequences yet.</p>
            <Link
              href="/"
              className="inline-block px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              Explore Activities
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {sequences.map((sequence) => {
              const stats = getSequenceStats(sequence);
              const progressPercent = stats.total > 0 ? Math.round((stats.participated / stats.total) * 100) : 0;

              return (
                <div
                  key={sequence.id}
                  className="bg-slate-800 rounded-lg shadow-xl p-4 sm:p-6 hover:bg-slate-750 transition-colors cursor-pointer"
                  onClick={() => router.push(`/sequence/${sequence.urlName}`)}
                >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-white mb-1">{sequence.title}</h2>
                      {sequence.description && (
                        <p className="text-sm text-gray-400">{sequence.description}</p>
                      )}
                    </div>
                    {getStatusBadge(sequence)}
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-gray-400">Progress</span>
                      <span className="text-xs text-gray-400">
                        {stats.participated} / {stats.total} completed
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex gap-4 text-xs text-gray-400">
                    <div>
                      <span className="font-semibold text-white">{stats.opened}</span> open
                    </div>
                    <div>
                      <span className="font-semibold text-white">{stats.closed}</span> closed
                    </div>
                    <div>
                      <span className="font-semibold text-white">{sequence.members.length}</span> members
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-3 text-xs text-gray-500">
                    Started {FormattingService.formatTimestamp(sequence.startedAt || sequence.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}