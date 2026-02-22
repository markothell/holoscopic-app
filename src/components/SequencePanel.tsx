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

/* ---- Shared warm editorial styles ---- */
const sx = {
  card: {
    background: 'rgba(255, 255, 255, 0.4)',
    border: '1px solid #D9D4CC',
    borderRadius: '8px',
    padding: '2rem',
  } as React.CSSProperties,
  sectionCard: {
    background: 'rgba(255, 255, 255, 0.3)',
    border: '1px solid #D9D4CC',
    borderRadius: '8px',
    padding: '1.25rem',
  } as React.CSSProperties,
  heading: {
    fontFamily: 'var(--font-barlow), sans-serif',
    fontWeight: 700 as const,
    textTransform: 'uppercase' as const,
    color: '#0F0D0B',
  },
  label: {
    display: 'block' as const,
    fontFamily: 'var(--font-dm-mono), monospace',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: '#6B6560',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.15em',
    marginBottom: '0.5rem',
  },
  input: {
    width: '100%',
    padding: '0.625rem 0.875rem',
    background: 'rgba(255, 255, 255, 0.6)',
    border: '1px solid #D9D4CC',
    borderRadius: '4px',
    color: '#0F0D0B',
    fontFamily: 'var(--font-cormorant), Georgia, serif',
    fontSize: '1rem',
    outline: 'none',
  } as React.CSSProperties,
  hint: {
    fontFamily: 'var(--font-dm-mono), monospace',
    fontSize: '0.65rem',
    color: '#6B6560',
    marginTop: '0.25rem',
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  checkbox: {
    width: '1rem',
    height: '1rem',
    borderRadius: '3px',
    border: '1px solid #D9D4CC',
    background: 'rgba(255, 255, 255, 0.6)',
    accentColor: '#C83B50',
    cursor: 'pointer' as const,
  },
  primaryBtn: {
    padding: '0.5rem 1.25rem',
    background: '#C83B50',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontFamily: 'var(--font-dm-mono), monospace',
    fontSize: '0.68rem',
    fontWeight: 400,
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer' as const,
    transition: 'background 0.2s',
  } as React.CSSProperties,
  secondaryBtn: {
    padding: '0.5rem 1.25rem',
    background: 'transparent',
    color: '#6B6560',
    border: '1px solid #D9D4CC',
    borderRadius: '4px',
    fontFamily: 'var(--font-dm-mono), monospace',
    fontSize: '0.68rem',
    fontWeight: 400,
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer' as const,
    transition: 'all 0.2s',
  } as React.CSSProperties,
  accentBtn: {
    padding: '0.4rem 0.75rem',
    background: '#1A4FD4',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontFamily: 'var(--font-dm-mono), monospace',
    fontSize: '0.62rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer' as const,
    transition: 'background 0.2s',
  } as React.CSSProperties,
  smallLink: {
    fontFamily: 'var(--font-dm-mono), monospace',
    fontSize: '0.62rem',
    color: '#1A4FD4',
    background: 'none',
    border: 'none',
    cursor: 'pointer' as const,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    padding: 0,
  } as React.CSSProperties,
};

export default function SequencePanel({
  editingSequence,
  onSequenceCreated,
  onSequenceUpdated,
  onCancel
}: SequencePanelProps) {
  const [title, setTitle] = useState('');
  const [urlName, setUrlName] = useState('');
  const [description, setDescription] = useState('');
  const [activities, setActivities] = useState<Array<{activityId: string; order: number; autoClose: boolean; duration: number | null; openedAt: Date | string | null; closedAt: Date | string | null; parentActivityIds: string[]}>>([]);
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
        closedAt: a.closedAt ?? null,
        parentActivityIds: a.parentActivityIds || []
      })));
      if (editingSequence.welcomePage) {
        setWelcomePage(editingSequence.welcomePage);
      } else {
        setWelcomePage({ enabled: false, requestName: false, welcomeText: '', referenceLink: '' });
      }
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
      const newOrder = activities.length > 0 ? Math.max(...activities.map(a => a.order)) + 1 : 1;
      setActivities([...activities, {
        activityId: '',
        order: newOrder,
        autoClose: false,
        duration: null,
        openedAt: null,
        closedAt: null,
        parentActivityIds: []
      }]);
    } else if (mode === 'create') {
      const returnUrl = window.location.href;
      window.open(`/admin?create=true&returnUrl=${encodeURIComponent(returnUrl)}`, '_blank');
    } else if (mode === 'clone') {
      setActivityMode('clone');
    }
  };

  const handleCloneActivity = async (activityIdToClone: string) => {
    if (!activityIdToClone) return;

    try {
      const activityToClone = availableActivities.find(a => a.id === activityIdToClone);
      if (!activityToClone) {
        alert('Activity not found');
        return;
      }

      const clonedActivity: Partial<HoloscopicActivity> = {
        ...activityToClone,
        id: '',
        urlName: `${activityToClone.urlName}-copy-${Date.now()}`,
        title: `${activityToClone.title} (Copy)`,
        isDraft: true,
        participants: [],
        ratings: [],
        comments: []
      };

      delete (clonedActivity as any).createdAt;
      delete (clonedActivity as any).updatedAt;

      const created = await ActivityService.createActivity({
        title: clonedActivity.title!,
        urlName: clonedActivity.urlName!,
        activityType: clonedActivity.activityType || 'dissolve',
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

      const updatedActivities = await ActivityService.getAdminActivities();
      setAvailableActivities(updatedActivities);

      const newOrder = activities.length > 0 ? Math.max(...activities.map(a => a.order)) + 1 : 1;
      setActivities([...activities, {
        activityId: created.id,
        order: newOrder,
        autoClose: false,
        duration: null,
        openedAt: null,
        closedAt: null,
        parentActivityIds: [] as string[]
      }]);

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
    [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
    updated.forEach((activity, i) => { activity.order = i + 1; });
    setActivities(updated);
  };

  const wouldCreateCycle = (targetIndex: number, newParentId: string): boolean => {
    const targetId = activities[targetIndex].activityId;
    const visited = new Set<string>();

    function hasPath(fromId: string): boolean {
      if (fromId === targetId) return true;
      if (visited.has(fromId)) return false;
      visited.add(fromId);
      return activities
        .filter(a => (a.parentActivityIds || []).includes(fromId))
        .some(child => hasPath(child.activityId));
    }

    return hasPath(newParentId);
  };

  const handleParentChange = (index: number, parentId: string, checked: boolean) => {
    if (checked && wouldCreateCycle(index, parentId)) {
      alert('Cannot add this parent \u2014 it would create a cycle.');
      return;
    }
    const updated = [...activities];
    const current = updated[index].parentActivityIds || [];
    if (checked) {
      updated[index] = { ...updated[index], parentActivityIds: [...current, parentId] };
    } else {
      updated[index] = { ...updated[index], parentActivityIds: current.filter(id => id !== parentId) };
    }
    setActivities(updated);
  };

  const handleToggleActivityClosed = async (activityId: string, currentlyClosed: boolean) => {
    if (!editingSequence) return;

    try {
      if (currentlyClosed) {
        const updatedSequence = await SequenceService.reopenActivity(editingSequence.id, activityId);
        onSequenceUpdated(updatedSequence);
      } else {
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

    const emailsToAdd = newEmailInput
      .split(/[\n,;]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    if (emailsToAdd.length === 0) {
      alert('No valid emails found. Please enter valid email addresses.');
      return;
    }

    const uniqueEmails = [...new Set([...invitedEmails, ...emailsToAdd])];
    setInvitedEmails(uniqueEmails);
    setNewEmailInput('');
  };

  const handleRemoveEmail = (email: string) => {
    setInvitedEmails(invitedEmails.filter(e => e !== email));
  };

  return (
    <div style={sx.card}>
      <h2 style={{ ...sx.heading, fontSize: '1.5rem', marginBottom: '1.5rem' }}>
        {editingSequence ? 'Edit Sequence' : 'Create New Sequence'}
      </h2>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(200, 59, 80, 0.06)', border: '1px solid rgba(200, 59, 80, 0.2)', borderRadius: '4px', color: '#C83B50', fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Basic Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={sx.label}>Sequence Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={sx.input}
              placeholder="e.g., Spring 2024 Cohort"
              required
            />
          </div>

          <div>
            <label style={sx.label}>URL Name *</label>
            <input
              type="text"
              value={urlName}
              onChange={(e) => setUrlName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              style={sx.input}
              placeholder="e.g., spring-2024-cohort"
              pattern="[a-z0-9\-]+"
              required
            />
            <p style={sx.hint}>Lowercase letters, numbers, and hyphens only</p>
          </div>

          <div>
            <label style={sx.label}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ ...sx.input, resize: 'vertical' as const }}
              placeholder="Brief description of this sequence..."
              rows={3}
            />
          </div>
        </div>

        {/* Public/Private */}
        <div style={sx.sectionCard}>
          <h3 style={{ ...sx.heading, fontSize: '1rem', marginBottom: '1rem' }}>Public/Private</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={requireInvitation}
                onChange={(e) => setRequireInvitation(e.target.checked)}
                style={sx.checkbox}
              />
              <span style={{ marginLeft: '0.5rem', fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.95rem', color: '#0F0D0B' }}>
                Private (require invitation to enroll)
              </span>
            </label>

            {requireInvitation && (
              <>
                <div>
                  <label style={sx.label}>Add Invited Emails</label>
                  <textarea
                    value={newEmailInput}
                    onChange={(e) => setNewEmailInput(e.target.value)}
                    style={{ ...sx.input, fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.85rem', resize: 'vertical' as const }}
                    placeholder={"Enter emails (one per line, or comma/semicolon separated)\nexample@domain.com\nanother@domain.com"}
                    rows={4}
                  />
                  <div style={{ marginTop: '0.5rem' }}>
                    <button type="button" onClick={handleAddEmails} style={sx.accentBtn}>
                      Add Emails
                    </button>
                  </div>
                </div>

                {invitedEmails.length > 0 && (
                  <div>
                    <label style={sx.label}>Invited Emails ({invitedEmails.length})</label>
                    <div style={{ background: 'rgba(255, 255, 255, 0.4)', border: '1px solid #D9D4CC', borderRadius: '6px', padding: '0.75rem', maxHeight: '12rem', overflowY: 'auto' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {invitedEmails.map((email, index) => (
                          <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.25rem 0.5rem', background: 'rgba(0, 0, 0, 0.02)', borderRadius: '4px' }}>
                            <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.75rem', color: '#0F0D0B' }}>{email}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveEmail(email)}
                              style={{ color: '#C83B50', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem' }}
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ ...sx.hint, background: 'rgba(0, 0, 0, 0.02)', borderRadius: '4px', padding: '0.5rem 0.75rem' }}>
                  <strong>Note:</strong> When invitation is required, only users with emails on this list will be able to enroll.
                </div>
              </>
            )}
          </div>
        </div>

        {/* Welcome Page Form */}
        {showWelcomePageForm && (
          <div style={sx.sectionCard}>
            <h3 style={{ ...sx.heading, fontSize: '1rem', marginBottom: '1rem' }}>Welcome Page Settings</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={welcomePage.enabled}
                  onChange={(e) => setWelcomePage({ ...welcomePage, enabled: e.target.checked })}
                  style={sx.checkbox}
                />
                <span style={{ marginLeft: '0.5rem', fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.95rem', color: '#0F0D0B' }}>
                  Enable welcome page for this sequence
                </span>
              </label>

              {welcomePage.enabled && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={welcomePage.requestName}
                      onChange={(e) => setWelcomePage({ ...welcomePage, requestName: e.target.checked })}
                      style={sx.checkbox}
                    />
                    <span style={{ marginLeft: '0.5rem', fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.95rem', color: '#0F0D0B' }}>
                      Request participant name for this sequence
                    </span>
                  </label>

                  <div>
                    <label style={sx.label}>Welcome Text</label>
                    <textarea
                      value={welcomePage.welcomeText}
                      onChange={(e) => setWelcomePage({ ...welcomePage, welcomeText: e.target.value })}
                      style={{ ...sx.input, resize: 'vertical' as const }}
                      placeholder="Enter welcome text for participants..."
                      rows={4}
                      maxLength={2000}
                    />
                    <p style={sx.hint}>{welcomePage.welcomeText.length}/2000 characters</p>
                  </div>

                  <div>
                    <label style={sx.label}>Reference Link (optional)</label>
                    <input
                      type="url"
                      value={welcomePage.referenceLink}
                      onChange={(e) => setWelcomePage({ ...welcomePage, referenceLink: e.target.value })}
                      style={sx.input}
                      placeholder="https://holoscopic.io/wiki/..."
                      maxLength={500}
                    />
                    <p style={sx.hint}>Link to wiki page or other reference material</p>
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop: '1rem' }}>
              <button type="button" onClick={() => setShowWelcomePageForm(false)} style={sx.accentBtn}>
                Done
              </button>
            </div>
          </div>
        )}

        {/* Activities */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <label style={{ ...sx.label, marginBottom: 0 }}>Activities</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShowWelcomePageForm(!showWelcomePageForm)}
                style={{
                  ...sx.secondaryBtn,
                  borderColor: welcomePage.enabled ? '#2a9d6f' : '#D9D4CC',
                  color: welcomePage.enabled ? '#2a9d6f' : '#6B6560',
                }}
              >
                {welcomePage.enabled ? '\u2713 Welcome Page' : 'Set Welcome Page'}
              </button>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowActivityModal(!showActivityModal)}
                  style={sx.primaryBtn}
                >
                  + Add Activity
                </button>
                {showActivityModal && (
                  <div style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: '0.5rem',
                    background: '#fff',
                    border: '1px solid #D9D4CC',
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                    padding: '0.25rem',
                    zIndex: 10,
                    width: '12rem',
                  }}>
                    {['existing', 'clone', 'create'].map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleAddActivity(mode as any)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '0.5rem 0.75rem',
                          fontFamily: 'var(--font-dm-mono), monospace',
                          fontSize: '0.65rem',
                          letterSpacing: '0.08em',
                          color: '#0F0D0B',
                          background: 'none',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.03)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                      >
                        {mode === 'existing' ? 'Add Existing Activity' : mode === 'clone' ? 'Clone Activity' : 'Create New Activity'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Clone Activity Selection */}
          {activityMode === 'clone' && (
            <div style={{ ...sx.sectionCard, marginBottom: '1rem' }}>
              <h3 style={{ ...sx.label, marginBottom: '0.75rem' }}>Select Activity to Clone</h3>
              <select
                value={selectedCloneActivityId}
                onChange={(e) => setSelectedCloneActivityId(e.target.value)}
                style={{ ...sx.input, marginBottom: '0.75rem' }}
              >
                <option value="">Select an activity...</option>
                {availableActivities.map((act) => (
                  <option key={act.id} value={act.id}>
                    {act.title} ({act.urlName})
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => handleCloneActivity(selectedCloneActivityId)}
                  disabled={!selectedCloneActivityId}
                  style={{ ...sx.accentBtn, opacity: selectedCloneActivityId ? 1 : 0.5, cursor: selectedCloneActivityId ? 'pointer' : 'not-allowed' }}
                >
                  Clone &amp; Add to Sequence
                </button>
                <button
                  type="button"
                  onClick={() => { setActivityMode('existing'); setSelectedCloneActivityId(''); }}
                  style={sx.secondaryBtn}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {activities.length === 0 && activityMode !== 'clone' ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: '#6B6560', fontFamily: 'var(--font-cormorant), Georgia, serif', fontStyle: 'italic' }}>
              No activities added yet. Click &ldquo;Add Activity&rdquo; to get started.
            </div>
          ) : activityMode !== 'clone' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {activities.map((activity, index) => (
                <div key={index} style={sx.sectionCard}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{
                      flexShrink: 0,
                      width: '2rem',
                      height: '2rem',
                      borderRadius: '50%',
                      border: '1px solid #D9D4CC',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--font-dm-mono), monospace',
                      fontSize: '0.7rem',
                      color: '#6B6560',
                    }}>
                      {index + 1}
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <label style={{ ...sx.hint, margin: 0 }}>Activity</label>
                          {activity.activityId && (
                            <button
                              type="button"
                              onClick={() => {
                                const returnUrl = window.location.href;
                                window.open(`/admin?activity=${activity.activityId}&returnUrl=${encodeURIComponent(returnUrl)}`, '_blank');
                              }}
                              style={sx.smallLink}
                            >
                              Edit &rarr;
                            </button>
                          )}
                        </div>
                        <select
                          value={activity.activityId}
                          onChange={(e) => handleActivityChange(index, 'activityId', e.target.value)}
                          style={sx.input}
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

                      {/* Author Selection */}
                      {activity.activityId && editingSequence && editingSequence.members.length > 0 && (
                        <div>
                          <label style={{ ...sx.hint, margin: 0, marginBottom: '0.25rem', display: 'block' }}>Author (optional)</label>
                          <select
                            value={
                              availableActivities.find(a => a.id === activity.activityId)?.author?.userId || ''
                            }
                            onChange={async (e) => {
                              const selectedUserId = e.target.value;
                              if (!selectedUserId) {
                                try {
                                  await ActivityService.updateActivity(activity.activityId, { author: null } as any);
                                  const updatedActivities = await ActivityService.getAdminActivities();
                                  setAvailableActivities(updatedActivities);
                                } catch (err) {
                                  console.error('Error clearing author:', err);
                                  alert('Failed to clear author');
                                }
                              } else {
                                const authorName = memberNames[selectedUserId] || selectedUserId;
                                try {
                                  await ActivityService.updateActivity(activity.activityId, {
                                    author: { userId: selectedUserId, name: authorName }
                                  } as any);
                                  const updatedActivities = await ActivityService.getAdminActivities();
                                  setAvailableActivities(updatedActivities);
                                } catch (err) {
                                  console.error('Error setting author:', err);
                                  alert('Failed to set author');
                                }
                              }
                            }}
                            style={sx.input}
                          >
                            <option value="">No author</option>
                            {editingSequence.members.map((member) => (
                              <option key={member.userId} value={member.userId}>
                                {memberNames[member.userId] || 'Loading...'}
                              </option>
                            ))}
                          </select>
                          <p style={sx.hint}>Set who proposed this activity</p>
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={activity.autoClose}
                            onChange={(e) => {
                              handleActivityChange(index, 'autoClose', e.target.checked);
                              if (e.target.checked && !activity.duration) {
                                handleActivityChange(index, 'duration', 7);
                              }
                            }}
                            style={sx.checkbox}
                          />
                          <span style={{ marginLeft: '0.5rem', fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.9rem', color: '#0F0D0B' }}>
                            Automatically close after duration
                          </span>
                        </label>

                        {activity.autoClose && (
                          <div>
                            <label style={{ ...sx.hint, margin: 0, marginBottom: '0.25rem', display: 'block' }}>Duration (days)</label>
                            <input
                              type="number"
                              value={activity.duration || 7}
                              onChange={(e) => handleActivityChange(index, 'duration', parseInt(e.target.value) || 1)}
                              style={sx.input}
                              min="1"
                              required={activity.autoClose}
                            />
                          </div>
                        )}

                        {/* Parent Activity Selection (DAG relationships) */}
                        {activity.activityId && activities.filter(a => a.activityId && a.activityId !== activity.activityId).length > 0 && (
                          <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #D9D4CC' }}>
                            <label style={{ ...sx.hint, margin: 0, marginBottom: '0.25rem', display: 'block' }}>Depends on</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              {activities
                                .filter(a => a.activityId && a.activityId !== activity.activityId)
                                .map((otherActivity) => {
                                  const actTitle = availableActivities.find(
                                    a => a.id === otherActivity.activityId
                                  )?.title || otherActivity.activityId;

                                  return (
                                    <label key={otherActivity.activityId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        checked={(activity.parentActivityIds || []).includes(otherActivity.activityId)}
                                        onChange={(e) => handleParentChange(index, otherActivity.activityId, e.target.checked)}
                                        style={{ ...sx.checkbox, width: '0.75rem', height: '0.75rem' }}
                                      />
                                      <span style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.85rem', color: '#0F0D0B' }}>
                                        {actTitle}
                                      </span>
                                    </label>
                                  );
                                })}
                            </div>
                          </div>
                        )}

                        {/* Activity Status and Manual Close/Reopen */}
                        {editingSequence && activity.activityId && (() => {
                          const seqActivity = editingSequence.activities.find(a => a.activityId === activity.activityId);
                          if (!seqActivity?.openedAt) return null;

                          const now = new Date();
                          const closedAt = seqActivity.closedAt ? new Date(seqActivity.closedAt) : null;
                          const isClosed = closedAt && now > closedAt;

                          return (
                            <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #D9D4CC' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                  <p style={{ ...sx.hint, margin: 0, marginBottom: '0.25rem' }}>Current Status</p>
                                  <span style={{
                                    display: 'inline-block',
                                    fontFamily: 'var(--font-dm-mono), monospace',
                                    fontSize: '0.55rem',
                                    letterSpacing: '0.12em',
                                    textTransform: 'uppercase',
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '999px',
                                    background: isClosed ? 'rgba(200, 59, 80, 0.1)' : 'rgba(42, 157, 111, 0.15)',
                                    color: isClosed ? '#C83B50' : '#2a9d6f',
                                  }}>
                                    {isClosed ? 'Closed' : 'Open'}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleToggleActivityClosed(activity.activityId, !!isClosed)}
                                  style={{
                                    ...sx.accentBtn,
                                    background: isClosed ? '#2a9d6f' : '#C83B50',
                                  }}
                                >
                                  {isClosed ? 'Reopen' : 'Close Now'}
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => handleMoveActivity(index, 'up')}
                        disabled={index === 0}
                        style={{ padding: '0.25rem', color: index === 0 ? '#D9D4CC' : '#6B6560', background: 'none', border: 'none', cursor: index === 0 ? 'not-allowed' : 'pointer', fontSize: '0.9rem' }}
                      >
                        &uarr;
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveActivity(index, 'down')}
                        disabled={index === activities.length - 1}
                        style={{ padding: '0.25rem', color: index === activities.length - 1 ? '#D9D4CC' : '#6B6560', background: 'none', border: 'none', cursor: index === activities.length - 1 ? 'not-allowed' : 'pointer', fontSize: '0.9rem' }}
                      >
                        &darr;
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveActivity(index)}
                        style={{ padding: '0.25rem', color: '#C83B50', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid #D9D4CC' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              ...sx.primaryBtn,
              flex: 1,
              padding: '0.75rem',
              opacity: loading ? 0.5 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Saving...' : (editingSequence ? 'Update Sequence' : 'Create Sequence')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              ...sx.secondaryBtn,
              padding: '0.75rem 1.5rem',
              opacity: loading ? 0.5 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
