'use client';

import { useState, useEffect } from 'react';
import { Sequence, CreateSequenceData, UpdateSequenceData, SequenceActivity, WelcomePage } from '@/models/Sequence';
import { HoloscopicActivity } from '@/models/Activity';
import { SequenceService } from '@/services/sequenceService';
import { ActivityService } from '@/services/activityService';

interface SequencePanelProps {
  editingSequence?: Sequence;
  onSequenceCreated: (sequence: Sequence) => void;
  onSequenceUpdated: (sequence: Sequence) => void;
  onCancel: () => void;
}

export default function SequencePanel({
  editingSequence,
  onSequenceCreated,
  onSequenceUpdated,
  onCancel
}: SequencePanelProps) {
  const [title, setTitle] = useState('');
  const [urlName, setUrlName] = useState('');
  const [description, setDescription] = useState('');
  const [activities, setActivities] = useState<Array<{activityId: string; order: number; autoClose: boolean; duration: number | null; openedAt: Date | string | null; closedAt: Date | string | null}>>([]);
  const [availableActivities, setAvailableActivities] = useState<HoloscopicActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityMode, setActivityMode] = useState<'existing' | 'clone' | 'create'>('existing');
  const [selectedCloneActivityId, setSelectedCloneActivityId] = useState<string>('');

  // Welcome page state
  const [showWelcomePageForm, setShowWelcomePageForm] = useState(false);
  const [welcomePage, setWelcomePage] = useState<WelcomePage>({
    enabled: false,
    requestName: false,
    welcomeText: '',
    referenceLink: ''
  });

  // Invitation management state
  const [requireInvitation, setRequireInvitation] = useState(false);
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [newEmailInput, setNewEmailInput] = useState('');

  // User names for author dropdown
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});

  // Load available activities
  useEffect(() => {
    const loadActivities = async () => {
      try {
        const data = await ActivityService.getAdminActivities();
        setAvailableActivities(data);
      } catch (err) {
        console.error('Error loading activities:', err);
      }
    };
    loadActivities();
  }, []);

  // Fetch member names when editing sequence
  useEffect(() => {
    const fetchMemberNames = async () => {
      if (!editingSequence || editingSequence.members.length === 0) return;

      try {
        const userIds = editingSequence.members.map(m => m.userId);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
        const response = await fetch(`${apiUrl}/auth/users/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.users) {
            // Map userId -> display name
            const names: Record<string, string> = {};
            Object.keys(data.users).forEach(userId => {
              names[userId] = data.users[userId].name;
            });
            setMemberNames(names);
          }
        }
      } catch (err) {
        console.error('Error fetching member names:', err);
      }
    };

    fetchMemberNames();
  }, [editingSequence]);

  // Initialize form with editing data
  useEffect(() => {
    if (editingSequence) {
      setTitle(editingSequence.title);
      setUrlName(editingSequence.urlName);
      setDescription(editingSequence.description || '');
      setActivities(editingSequence.activities.map(a => ({
        activityId: a.activityId,
        order: a.order,
        autoClose: a.autoClose ?? false,
        duration: a.duration ?? null,
        openedAt: a.openedAt ?? null,
        closedAt: a.closedAt ?? null
      })));
      // Initialize welcomePage with defaults if not present
      if (editingSequence.welcomePage) {
        setWelcomePage(editingSequence.welcomePage);
      } else {
        setWelcomePage({
          enabled: false,
          requestName: false,
          welcomeText: '',
          referenceLink: ''
        });
      }
      // Initialize invitation settings
      setRequireInvitation(editingSequence.requireInvitation || false);
      setInvitedEmails(editingSequence.invitedEmails || []);
    }
  }, [editingSequence]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data: CreateSequenceData | UpdateSequenceData = {
        title,
        urlName,
        description,
        welcomePage,
        activities,
        requireInvitation,
        invitedEmails
      };

      if (editingSequence) {
        const updated = await SequenceService.updateSequence(editingSequence.id, data);
        onSequenceUpdated(updated);
      } else {
        const created = await SequenceService.createSequence(data as CreateSequenceData);
        onSequenceCreated(created);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sequence');
    } finally {
      setLoading(false);
    }
  };

  const handleAddActivity = (mode: 'existing' | 'clone' | 'create') => {
    setActivityMode(mode);
    setShowActivityModal(false);

    if (mode === 'existing') {
      // Add empty activity for user to select
      const newOrder = activities.length > 0 ? Math.max(...activities.map(a => a.order)) + 1 : 1;
      setActivities([...activities, {
        activityId: '',
        order: newOrder,
        autoClose: false,
        duration: null,
        openedAt: null,
        closedAt: null
      }]);
    } else if (mode === 'create') {
      // Open admin panel with create form in new tab and return URL
      const returnUrl = window.location.href;
      window.open(`/admin?create=true&returnUrl=${encodeURIComponent(returnUrl)}`, '_blank');
    } else if (mode === 'clone') {
      // Show clone selection UI
      setActivityMode('clone');
    }
  };

  const handleCloneActivity = async (activityIdToClone: string) => {
    if (!activityIdToClone) return;

    try {
      // Fetch the activity to clone
      const activityToClone = availableActivities.find(a => a.id === activityIdToClone);
      if (!activityToClone) {
        alert('Activity not found');
        return;
      }

      // Create a cloned activity
      const clonedActivity: Partial<HoloscopicActivity> = {
        ...activityToClone,
        id: '', // Clear ID so a new one will be generated
        urlName: `${activityToClone.urlName}-copy-${Date.now()}`,
        title: `${activityToClone.title} (Copy)`,
        isDraft: true,
        participants: [],
        ratings: [],
        comments: []
      };

      delete (clonedActivity as any).createdAt;
      delete (clonedActivity as any).updatedAt;

      // Create the cloned activity via API
      const created = await ActivityService.createActivity({
        title: clonedActivity.title!,
        urlName: clonedActivity.urlName!,
        activityType: clonedActivity.activityType || 'holoscopic',
        mapQuestion: clonedActivity.mapQuestion!,
        mapQuestion2: clonedActivity.mapQuestion2!,
        objectNameQuestion: clonedActivity.objectNameQuestion!,
        xAxisLabel: clonedActivity.xAxis!.label,
        xAxisMin: clonedActivity.xAxis!.min,
        xAxisMax: clonedActivity.xAxis!.max,
        yAxisLabel: clonedActivity.yAxis!.label,
        yAxisMin: clonedActivity.yAxis!.min,
        yAxisMax: clonedActivity.yAxis!.max,
        commentQuestion: clonedActivity.commentQuestion!,
        preamble: clonedActivity.preamble || '',
        wikiLink: clonedActivity.wikiLink || '',
        starterData: clonedActivity.starterData || ''
      });

      // Reload available activities
      const updatedActivities = await ActivityService.getAdminActivities();
      setAvailableActivities(updatedActivities);

      // Add the cloned activity to the sequence with the new activity pre-selected
      const newOrder = activities.length > 0 ? Math.max(...activities.map(a => a.order)) + 1 : 1;
      const newActivity = {
        activityId: created.id,
        order: newOrder,
        autoClose: false,
        duration: null,
        openedAt: null,
        closedAt: null
      };
      setActivities([...activities, newActivity]);

      setActivityMode('existing');
      setSelectedCloneActivityId('');
      alert(`Activity "${created.title}" cloned and added to sequence!`);
    } catch (err) {
      console.error('Error cloning activity:', err);
      alert('Failed to clone activity');
    }
  };

  const handleRemoveActivity = (index: number) => {
    setActivities(activities.filter((_, i) => i !== index));
  };

  const handleActivityChange = (index: number, field: 'activityId' | 'order' | 'autoClose' | 'duration', value: string | number | boolean) => {
    const updated = [...activities];
    updated[index] = { ...updated[index], [field]: value };
    setActivities(updated);
  };

  const handleMoveActivity = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === activities.length - 1) return;

    const updated = [...activities];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    // Swap
    [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];

    // Update order values
    updated.forEach((activity, i) => {
      activity.order = i + 1;
    });

    setActivities(updated);
  };

  const handleToggleActivityClosed = async (activityId: string, currentlyClosed: boolean) => {
    if (!editingSequence) return;

    try {
      if (currentlyClosed) {
        // Reopen the activity by clearing closedAt
        const updatedSequence = await SequenceService.reopenActivity(editingSequence.id, activityId);
        onSequenceUpdated(updatedSequence);
      } else {
        // Close the activity
        const updatedSequence = await SequenceService.closeActivity(editingSequence.id, activityId);
        onSequenceUpdated(updatedSequence);
      }
    } catch (err: any) {
      console.error('Error toggling activity status:', err);
      alert(err.message || 'Failed to toggle activity status');
    }
  };

  const handleAddEmails = () => {
    if (!newEmailInput.trim()) return;

    // Split by newlines, commas, or semicolons
    const emailsToAdd = newEmailInput
      .split(/[\n,;]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)); // Basic email validation

    if (emailsToAdd.length === 0) {
      alert('No valid emails found. Please enter valid email addresses.');
      return;
    }

    // Deduplicate and add to list
    const uniqueEmails = [...new Set([...invitedEmails, ...emailsToAdd])];
    setInvitedEmails(uniqueEmails);
    setNewEmailInput('');
  };

  const handleRemoveEmail = (email: string) => {
    setInvitedEmails(invitedEmails.filter(e => e !== email));
  };

  return (
    <div className="bg-slate-800 rounded-lg shadow-xl p-4 sm:p-6 lg:p-8">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-6">
        {editingSequence ? 'Edit Sequence' : 'Create New Sequence'}
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Sequence Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Spring 2024 Cohort"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              URL Name *
            </label>
            <input
              type="text"
              value={urlName}
              onChange={(e) => setUrlName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., spring-2024-cohort"
              pattern="[a-z0-9\-]+"
              required
            />
            <p className="mt-1 text-xs text-gray-400">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Brief description of this sequence..."
              rows={3}
            />
          </div>
        </div>

        {/* Public/Private */}
        <div className="bg-slate-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-4">Public/Private</h3>

          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="requireInvitation"
                checked={requireInvitation}
                onChange={(e) => setRequireInvitation(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-slate-600 border-slate-500 rounded focus:ring-blue-500"
              />
              <label htmlFor="requireInvitation" className="ml-2 text-sm text-gray-300">
                Private (require invitation to enroll)
              </label>
            </div>

            {requireInvitation && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Add Invited Emails
                  </label>
                  <textarea
                    value={newEmailInput}
                    onChange={(e) => setNewEmailInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    placeholder="Enter emails (one per line, or comma/semicolon separated)&#10;example@domain.com&#10;another@domain.com"
                    rows={4}
                  />
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={handleAddEmails}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                    >
                      Add Emails
                    </button>
                  </div>
                </div>

                {invitedEmails.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Invited Emails ({invitedEmails.length})
                    </label>
                    <div className="bg-slate-600 rounded-lg p-3 max-h-48 overflow-y-auto">
                      <div className="space-y-1">
                        {invitedEmails.map((email, index) => (
                          <div key={index} className="flex items-center justify-between py-1 px-2 bg-slate-700 rounded text-sm">
                            <span className="text-gray-300 font-mono">{email}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveEmail(email)}
                              className="text-red-400 hover:text-red-300 ml-2"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-400 bg-slate-600 rounded p-3">
                  <strong>Note:</strong> When invitation is required, only users with emails on this list will be able to enroll in the sequence. The sequence will not appear in public listings.
                </div>
              </>
            )}
          </div>
        </div>

        {/* Welcome Page Form */}
        {showWelcomePageForm && (
          <div className="bg-slate-700 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Welcome Page Settings</h3>

            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="welcomeEnabled"
                  checked={welcomePage.enabled}
                  onChange={(e) => setWelcomePage({ ...welcomePage, enabled: e.target.checked })}
                  className="w-4 h-4 text-blue-600 bg-slate-600 border-slate-500 rounded focus:ring-blue-500"
                />
                <label htmlFor="welcomeEnabled" className="ml-2 text-sm text-gray-300">
                  Enable welcome page for this sequence
                </label>
              </div>

              {welcomePage.enabled && (
                <>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="requestName"
                      checked={welcomePage.requestName}
                      onChange={(e) => setWelcomePage({ ...welcomePage, requestName: e.target.checked })}
                      className="w-4 h-4 text-blue-600 bg-slate-600 border-slate-500 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="requestName" className="ml-2 text-sm text-gray-300">
                      Request participant name for this sequence
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Welcome Text
                    </label>
                    <textarea
                      value={welcomePage.welcomeText}
                      onChange={(e) => setWelcomePage({ ...welcomePage, welcomeText: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter welcome text for participants..."
                      rows={4}
                      maxLength={2000}
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      {welcomePage.welcomeText.length}/2000 characters
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Reference Link (optional)
                    </label>
                    <input
                      type="url"
                      value={welcomePage.referenceLink}
                      onChange={(e) => setWelcomePage({ ...welcomePage, referenceLink: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://holoscopic.io/wiki/..."
                      maxLength={500}
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Link to wiki page or other reference material
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowWelcomePageForm(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Activities */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="block text-sm font-medium text-gray-300">
              Activities
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowWelcomePageForm(!showWelcomePageForm)}
                className={`px-3 py-1 text-white text-sm rounded transition-colors ${
                  welcomePage.enabled
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                {welcomePage.enabled ? '✓ Set Welcome Page' : 'Set Welcome Page'}
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowActivityModal(!showActivityModal)}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                >
                  + Add Activity
                </button>
                {showActivityModal && (
                <div className="absolute right-0 top-full mt-2 bg-slate-700 rounded-lg shadow-xl p-2 z-10 w-48">
                  <button
                    type="button"
                    onClick={() => handleAddActivity('existing')}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-600 rounded"
                  >
                    Add Existing Activity
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddActivity('clone')}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-600 rounded"
                  >
                    Clone Activity
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddActivity('create')}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-600 rounded"
                  >
                    Create New Activity
                  </button>
                </div>
              )}
              </div>
            </div>
          </div>

          {/* Clone Activity Selection */}
          {activityMode === 'clone' && (
            <div className="bg-slate-700 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-medium text-white mb-3">Select Activity to Clone</h3>
              <select
                value={selectedCloneActivityId}
                onChange={(e) => setSelectedCloneActivityId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-600 border border-slate-500 text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              >
                <option value="">Select an activity...</option>
                {availableActivities.map((act) => (
                  <option key={act.id} value={act.id}>
                    {act.title} ({act.urlName})
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleCloneActivity(selectedCloneActivityId)}
                  disabled={!selectedCloneActivityId}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white text-sm rounded transition-colors"
                >
                  Clone & Add to Sequence
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivityMode('existing');
                    setSelectedCloneActivityId('');
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {activities.length === 0 && activityMode !== 'clone' ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              No activities added yet. Click "Add Activity" to get started.
            </div>
          ) : activityMode !== 'clone' ? (
            <div className="space-y-3">
              {activities.map((activity, index) => (
                <div key={index} className="bg-slate-700 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-white font-semibold text-sm">
                      {index + 1}
                    </div>

                    <div className="flex-1 space-y-3">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-xs text-gray-400">Activity</label>
                          {activity.activityId && (
                            <button
                              type="button"
                              onClick={() => {
                                const returnUrl = window.location.href;
                                window.open(`/admin?activity=${activity.activityId}&returnUrl=${encodeURIComponent(returnUrl)}`, '_blank');
                              }}
                              className="text-xs text-blue-400 hover:text-blue-300"
                            >
                              Edit →
                            </button>
                          )}
                        </div>
                        <select
                          value={activity.activityId}
                          onChange={(e) => handleActivityChange(index, 'activityId', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-600 border border-slate-500 text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          <option value="">Select an activity...</option>
                          {availableActivities.map((act) => (
                            <option key={act.id} value={act.id}>
                              {act.title} ({act.urlName})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Author Selection (from sequence members) */}
                      {activity.activityId && editingSequence && editingSequence.members.length > 0 && (
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Author (optional)</label>
                          <select
                            value={
                              availableActivities.find(a => a.id === activity.activityId)?.author?.userId || ''
                            }
                            onChange={async (e) => {
                              const selectedUserId = e.target.value;
                              if (!selectedUserId) {
                                // Clear author
                                try {
                                  await ActivityService.updateActivity(activity.activityId, { author: null } as any);
                                  const updatedActivities = await ActivityService.getAdminActivities();
                                  setAvailableActivities(updatedActivities);
                                } catch (err) {
                                  console.error('Error clearing author:', err);
                                  alert('Failed to clear author');
                                }
                              } else {
                                // Set author
                                const authorName = memberNames[selectedUserId] || selectedUserId;
                                try {
                                  await ActivityService.updateActivity(activity.activityId, {
                                    author: {
                                      userId: selectedUserId,
                                      name: authorName
                                    }
                                  } as any);
                                  const updatedActivities = await ActivityService.getAdminActivities();
                                  setAvailableActivities(updatedActivities);
                                } catch (err) {
                                  console.error('Error setting author:', err);
                                  alert('Failed to set author');
                                }
                              }
                            }}
                            className="w-full px-3 py-2 bg-slate-600 border border-slate-500 text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">No author</option>
                            {editingSequence.members.map((member) => (
                              <option key={member.userId} value={member.userId}>
                                {memberNames[member.userId] || 'Loading...'}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-400 mt-1">
                            Set who proposed this activity
                          </p>
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id={`autoClose-${index}`}
                            checked={activity.autoClose}
                            onChange={(e) => {
                              handleActivityChange(index, 'autoClose', e.target.checked);
                              // Set default duration when enabling autoClose
                              if (e.target.checked && !activity.duration) {
                                handleActivityChange(index, 'duration', 7);
                              }
                            }}
                            className="w-4 h-4 text-blue-600 bg-slate-600 border-slate-500 rounded focus:ring-blue-500"
                          />
                          <label htmlFor={`autoClose-${index}`} className="ml-2 text-xs text-gray-300">
                            Automatically close after duration
                          </label>
                        </div>

                        {activity.autoClose && (
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Duration (days)</label>
                            <input
                              type="number"
                              value={activity.duration || 7}
                              onChange={(e) => handleActivityChange(index, 'duration', parseInt(e.target.value) || 1)}
                              className="w-full px-3 py-2 bg-slate-600 border border-slate-500 text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              min="1"
                              required={activity.autoClose}
                            />
                          </div>
                        )}

                        {/* Activity Status and Manual Close/Reopen (only for existing sequences) */}
                        {editingSequence && activity.activityId && (() => {
                          const seqActivity = editingSequence.activities.find(a => a.activityId === activity.activityId);
                          if (!seqActivity?.openedAt) return null;

                          const now = new Date();
                          const closedAt = seqActivity.closedAt ? new Date(seqActivity.closedAt) : null;
                          const isClosed = closedAt && now > closedAt;

                          return (
                            <div className="pt-3 border-t border-slate-600">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs text-gray-400 mb-1">Current Status</p>
                                  <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${
                                    isClosed
                                      ? 'bg-red-900 text-red-300'
                                      : 'bg-green-900 text-green-300'
                                  }`}>
                                    {isClosed ? 'Closed' : 'Open'}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleToggleActivityClosed(activity.activityId, !!isClosed)}
                                  className={`px-3 py-1 text-xs rounded transition-colors ${
                                    isClosed
                                      ? 'bg-green-600 hover:bg-green-700 text-white'
                                      : 'bg-red-600 hover:bg-red-700 text-white'
                                  }`}
                                >
                                  {isClosed ? 'Reopen' : 'Close Now'}
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveActivity(index, 'up')}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveActivity(index, 'down')}
                        disabled={index === activities.length - 1}
                        className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveActivity(index)}
                        className="p-1 text-red-400 hover:text-red-300"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Saving...' : (editingSequence ? 'Update Sequence' : 'Create Sequence')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-600/50 text-white font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}