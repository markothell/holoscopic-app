'use client';

import { useState, useEffect } from 'react';
import { HoloscopicActivity, ActivityFormData, ActivityType } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';
import { ValidationService } from '@/utils/validation';
import { UrlUtils } from '@/utils/urlUtils';
import { useAuth } from '@/contexts/AuthContext';
import { CollapsibleSection, ACTIVITY_TYPES, getActivityTypeConfig, normalizeActivityType, REGISTRY } from '@hs/activities';

interface AdminPanelProps {
  editingActivity?: HoloscopicActivity;
  onActivityCreated?: (activity: HoloscopicActivity) => void;
  onActivityUpdated?: (activity: HoloscopicActivity) => void;
  onCancel?: () => void;
}

/* ---- Warm editorial inline style helpers ---- */
const s = {
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
  },
  hint: {
    fontFamily: 'var(--font-dm-mono), monospace',
    fontSize: '0.65rem',
    color: '#6B6560',
    marginTop: '0.25rem',
    letterSpacing: '0.05em',
  },
  error: {
    color: '#C83B50',
    fontSize: '0.8rem',
    marginTop: '0.25rem',
    fontFamily: 'var(--font-cormorant), Georgia, serif',
  },
  checkbox: {
    width: '1rem',
    height: '1rem',
    borderRadius: '3px',
    border: '1px solid #D9D4CC',
    background: 'rgba(255, 255, 255, 0.6)',
    accentColor: '#C83B50',
    cursor: 'pointer' as const,
  },
  radio: {
    width: '1rem',
    height: '1rem',
    accentColor: '#C83B50',
    cursor: 'pointer' as const,
  },
};

// Get default form data based on activity type
const getDefaultFormData = (activityType: ActivityType): ActivityFormData => {
  if (activityType === 'resolve') {
    return {
      title: '',
      urlName: '',
      activityType,
      mapQuestion: '',
      mapQuestion2: '',
      objectNameQuestion: 'Name something that represents your perspective',
      xAxisLabel: 'Horizontal Axis',
      xAxisMin: 'Min',
      xAxisMax: 'Max',
      yAxisLabel: 'Vertical Axis',
      yAxisMin: 'Min',
      yAxisMax: 'Max',
      commentQuestion: '',
      preamble: '',
      wikiLink: '',
      starterData: '',
      votesPerUser: null,
      maxEntries: 1,
      showProfileLinks: true,
      showAxisLabels: true,
    };
  }

  if (activityType === 'snapshot') {
    return {
      title: '',
      urlName: '',
      activityType,
      mapQuestion: '',
      mapQuestion2: '',
      objectNameQuestion: 'Name something that represents your perspective',
      xAxisLabel: 'Horizontal',
      xAxisMin: 'Left',
      xAxisMax: 'Right',
      yAxisLabel: 'Vertical',
      yAxisMin: 'Bottom',
      yAxisMax: 'Top',
      commentQuestion: '',
      preamble: '',
      wikiLink: '',
      starterData: '',
      votesPerUser: null,
      maxEntries: 1,
      showProfileLinks: true,
      showAxisLabels: true,
      snapshotQuestions: [],
      xAxisPoints: 2,
      yAxisPoints: 2,
      xAxisLabels: ['Left', 'Right'],
      yAxisLabels: ['Bottom', 'Top'],
    };
  }

  // dissolve defaults
  return {
    title: '',
    urlName: '',
    activityType,
    mapQuestion: '',
    mapQuestion2: '',
    objectNameQuestion: 'Name something that represents your perspective',
    xAxisLabel: '',
    xAxisMin: '',
    xAxisMax: '',
    yAxisLabel: '',
    yAxisMin: '',
    yAxisMax: '',
    commentQuestion: '',
    preamble: '',
    wikiLink: '',
    starterData: '',
    votesPerUser: null,
    maxEntries: 1,
    showProfileLinks: true,
    showAxisLabels: true,
  };
};

export default function AdminPanel({
  editingActivity,
  onActivityCreated,
  onActivityUpdated,
  onCancel
}: AdminPanelProps) {
  const { userId, userEmail } = useAuth();

  // For new activities, show type selection first
  const [selectedType, setSelectedType] = useState<ActivityType | null>(editingActivity ? editingActivity.activityType || 'dissolve' : null);

  const [formData, setFormData] = useState<ActivityFormData>(getDefaultFormData('dissolve'));

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Populate form when editing
  useEffect(() => {
    if (editingActivity) {
      const activityType = editingActivity.activityType || 'dissolve';
      setSelectedType(activityType);

      const formValues = {
        title: editingActivity.title,
        urlName: editingActivity.urlName,
        activityType: activityType,
        mapQuestion: editingActivity.mapQuestion,
        mapQuestion2: editingActivity.mapQuestion2 || '',
        objectNameQuestion: editingActivity.objectNameQuestion || 'Name something that represents your perspective',
        xAxisLabel: editingActivity.xAxis.label,
        xAxisMin: editingActivity.xAxis.min,
        xAxisMax: editingActivity.xAxis.max,
        yAxisLabel: editingActivity.yAxis.label,
        yAxisMin: editingActivity.yAxis.min,
        yAxisMax: editingActivity.yAxis.max,
        commentQuestion: editingActivity.commentQuestion,
        preamble: editingActivity.preamble || '',
        wikiLink: editingActivity.wikiLink || '',
        starterData: editingActivity.starterData || '',
        votesPerUser: editingActivity.votesPerUser ?? null,
        maxEntries: editingActivity.maxEntries ?? 1,
        isPublic: editingActivity.isPublic ?? false,
        showProfileLinks: editingActivity.showProfileLinks ?? true,
        showAxisLabels: editingActivity.showAxisLabels ?? true,
        // Snapshot-specific
        snapshotQuestions: editingActivity.snapshotQuestions || [],
        xAxisPoints: editingActivity.xAxisPoints || 2,
        yAxisPoints: editingActivity.yAxisPoints || 2,
        xAxisLabels: editingActivity.xAxisLabels || [],
        yAxisLabels: editingActivity.yAxisLabels || [],
      };

      setFormData(formValues);
    }
  }, [editingActivity]);

  // Handle activity type selection (for new activities)
  const handleTypeSelect = (type: ActivityType) => {
    setSelectedType(type);
    setFormData(getDefaultFormData(type));
  };

  // Handle form field changes
  const handleFieldChange = (field: keyof ActivityFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted with data:', formData);

    if (isSubmitting) {
      console.log('Already submitting, returning early');
      return;
    }

    // Validate form
    console.log('Validating form data...');
    const validation = ValidationService.validateActivityForm(formData);
    console.log('Validation result:', validation);

    if (!validation.isValid) {
      console.error('Form validation failed:', validation.errors);
      setValidationErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (editingActivity && editingActivity.id) {
        // Update existing activity (only if it has a valid ID)
        console.log('Updating existing activity:', editingActivity.id);
        const updatedActivity = await ActivityService.updateActivity(editingActivity.id, formData);
        console.log('Activity updated successfully:', updatedActivity);
        onActivityUpdated?.(updatedActivity);
      } else {
        // Create new activity (for new activities or duplicates without ID)
        console.log('Creating new activity...');
        const newActivity = await ActivityService.createActivity(formData);
        console.log('Activity created successfully:', newActivity);

        // Automatically set the author to the current user
        if (userId && userEmail) {
          try {
            console.log('Setting author to current user:', userId, userEmail);
            await ActivityService.updateActivity(newActivity.id, {
              author: {
                userId: userId,
                name: userEmail
              }
            } as any);
            // Fetch the updated activity to return with author set
            const updatedActivity = await ActivityService.getActivity(newActivity.id);
            console.log('Author set successfully');
            onActivityCreated?.(updatedActivity);
          } catch (authorError) {
            console.error('Failed to set author, but activity was created:', authorError);
            onActivityCreated?.(newActivity);
          }
        } else {
          onActivityCreated?.(newActivity);
        }
      }
    } catch (error) {
      console.error('Error saving activity:', error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to save activity');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    onCancel?.();
  };

  // Handle sync starter data
  const handleSyncStarterData = async () => {
    if (!editingActivity || !editingActivity.id) {
      console.error('No editing activity with valid ID found');
      setSyncMessage('Please save the activity first before syncing starter data');
      setTimeout(() => setSyncMessage(null), 3000);
      return;
    }

    setIsSyncing(true);
    setSyncMessage(null);

    try {
      // First save the current form data (including starter data)
      await ActivityService.updateActivity(editingActivity.id, formData);

      // Then sync the starter data to database
      const updatedActivity = await ActivityService.syncStarterData(editingActivity.id);
      setSyncMessage('Starter data synced successfully!');

      // Update the parent component with the refreshed activity
      if (onActivityUpdated) {
        onActivityUpdated(updatedActivity);
      }

      // Clear message after 3 seconds
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (error) {
      console.error('Error syncing starter data:', error);
      setSyncMessage(`Failed to sync starter data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // If no type selected yet (new activity), show type selection screen
  if (!selectedType && !editingActivity) {
    return (
      <div style={{ maxWidth: '42rem', margin: '0 auto' }}>
        <div style={{ background: 'rgba(255, 255, 255, 0.4)', border: '1px solid #D9D4CC', borderRadius: '8px', padding: '2rem' }}>
          {/* Header */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-barlow), sans-serif', fontSize: '1.5rem', fontWeight: 700, textTransform: 'uppercase', color: '#0F0D0B' }}>
              Create New Activity
            </h2>
            <p style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', color: '#6B6560', marginTop: '0.5rem', fontStyle: 'italic' }}>
              Select an activity type to get started
            </p>
          </div>

          {/* Activity Type Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Object.values(ACTIVITY_TYPES).map((type) => (
              <button
                key={type.id}
                onClick={() => handleTypeSelect(type.id)}
                style={{
                  width: '100%',
                  padding: '1.5rem',
                  border: '2px solid #D9D4CC',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.4)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#C83B50';
                  e.currentTarget.style.background = 'rgba(200, 59, 80, 0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#D9D4CC';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.4)';
                }}
              >
                <h3 style={{ fontFamily: 'var(--font-barlow), sans-serif', fontSize: '1.1rem', fontWeight: 600, textTransform: 'uppercase', color: '#0F0D0B', marginBottom: '0.25rem' }}>
                  {type.label}
                </h3>
                <p style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.9rem', color: '#6B6560' }}>
                  {type.id === 'dissolve'
                    ? 'Two slider questions to position responses on X and Y axes. Best for continuous 2D mapping.'
                    : '4-quadrant selector with gravity-based clustering. Best for categorical positioning.'}
                </p>
                <p style={{ ...s.hint, marginTop: '0.5rem' }}>
                  Screens: {type.screens.join(' \u2192 ')}
                </p>
              </button>
            ))}
          </div>

          {/* Cancel Button */}
          {onCancel && (
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: '0.5rem 1.25rem',
                  background: 'transparent',
                  color: '#6B6560',
                  border: '1px solid #D9D4CC',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-dm-mono), monospace',
                  fontSize: '0.68rem',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '42rem', margin: '0 auto' }}>
      <div style={{ background: 'rgba(255, 255, 255, 0.4)', border: '1px solid #D9D4CC', borderRadius: '8px', padding: '2rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-barlow), sans-serif', fontSize: '1.5rem', fontWeight: 700, textTransform: 'uppercase', color: '#0F0D0B' }}>
                {editingActivity ? 'Edit Activity' : 'Create New Activity'}
              </h2>
              <p style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.68rem', color: '#6B6560', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '0.25rem' }}>
                {getActivityTypeConfig(formData.activityType)?.label || 'Activity'} Configuration
              </p>
            </div>
            {!editingActivity && (
              <button
                type="button"
                onClick={() => setSelectedType(null)}
                style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.68rem', color: '#C83B50', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                Change Type
              </button>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Entry Section */}
          <CollapsibleSection title="Entry" defaultOpen={false}>
            {/* Title */}
            <div>
              <label htmlFor="title" style={s.label}>Activity Title</label>
              <input
                type="text"
                id="title"
                value={formData.title}
                onChange={(e) => handleFieldChange('title', e.target.value)}
                style={s.input}
                placeholder="Title"
                maxLength={100}
              />
              {validationErrors.title && <p style={s.error}>{validationErrors.title}</p>}
            </div>

            {/* URL Name */}
            <div>
              <label htmlFor="urlName" style={s.label}>URL Name</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ ...s.hint, marginTop: 0 }}>holoscopic.io/</span>
                <input
                  type="text"
                  id="urlName"
                  value={formData.urlName || ''}
                  onChange={(e) => handleFieldChange('urlName', e.target.value)}
                  style={{ ...s.input, flex: 1 }}
                  placeholder="url-slug"
                  maxLength={50}
                />
              </div>
              <p style={s.hint}>
                {formData.urlName ?
                  `URL: holoscopic.io/a/${UrlUtils.cleanActivityName(formData.urlName)}` :
                  'Leave empty to auto-generate from title'
                }
              </p>
              {validationErrors.urlName && <p style={s.error}>{validationErrors.urlName}</p>}
            </div>

            {/* Public/Private Access */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.isPublic || false}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, isPublic: e.target.checked }));
                  }}
                  style={s.checkbox}
                />
                <span style={{ marginLeft: '0.5rem', fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.95rem', color: '#0F0D0B' }}>
                  Make activity public (no login required)
                </span>
              </label>
              <p style={{ ...s.hint, marginLeft: '1.5rem' }}>
                Public activities can be accessed by anyone without creating an account.
              </p>
            </div>

            {/* Preamble */}
            <div>
              <label htmlFor="preamble" style={s.label}>Activity Description (Optional)</label>
              <textarea
                id="preamble"
                value={formData.preamble || ''}
                onChange={(e) => handleFieldChange('preamble', e.target.value)}
                style={{ ...s.input, resize: 'vertical' as const }}
                placeholder="Short description..."
                maxLength={500}
                rows={3}
              />
              <p style={s.hint}>A short paragraph shown on the activity entry page</p>
              {validationErrors.preamble && <p style={s.error}>{validationErrors.preamble}</p>}
            </div>

            {/* Reference Link */}
            <div>
              <label htmlFor="wikiLink" style={s.label}>Reference Link (Optional)</label>
              <input
                type="text"
                id="wikiLink"
                value={formData.wikiLink || ''}
                onChange={(e) => handleFieldChange('wikiLink', e.target.value)}
                style={s.input}
                placeholder="https://..."
                maxLength={200}
              />
              <p style={s.hint}>Link to reference material for this activity</p>
              {validationErrors.wikiLink && <p style={s.error}>{validationErrors.wikiLink}</p>}
            </div>
          </CollapsibleSection>

          {/* Type-specific fields */}
          {selectedType && (() => {
            const TypeCreatePanel = REGISTRY[normalizeActivityType(selectedType) as 'dissolve' | 'resolve' | 'snapshot']?.CreatePanel;
            return TypeCreatePanel ? (
              <TypeCreatePanel
                formData={formData}
                setFormData={setFormData}
                validationErrors={validationErrors}
                editingActivity={editingActivity}
                onSyncStarterData={handleSyncStarterData}
                isSyncing={isSyncing}
                syncMessage={syncMessage}
              />
            ) : null;
          })()}

          {/* Results Section */}
          <CollapsibleSection title="Results" defaultOpen={false}>
            {/* Profile Links Toggle */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.showProfileLinks ?? true}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, showProfileLinks: e.target.checked }));
                  }}
                  style={s.checkbox}
                />
                <span style={{ marginLeft: '0.5rem', fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.95rem', color: '#0F0D0B' }}>
                  Show profile links in results
                </span>
              </label>
              <p style={{ ...s.hint, marginLeft: '1.5rem' }}>
                When enabled, authenticated users will see clickable profile icons next to comments.
              </p>
            </div>

            {/* Axis Labels Toggle */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.showAxisLabels ?? true}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, showAxisLabels: e.target.checked }));
                  }}
                  style={s.checkbox}
                />
                <span style={{ marginLeft: '0.5rem', fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.95rem', color: '#0F0D0B' }}>
                  Show axis labels on map
                </span>
              </label>
              <p style={{ ...s.hint, marginLeft: '1.5rem' }}>
                When enabled, the X and Y axis labels appear on the center of the map grid.
              </p>
            </div>

            {/* Vote Limit Configuration */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.votesPerUser !== null && formData.votesPerUser !== undefined}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFormData(prev => ({ ...prev, votesPerUser: 1 }));
                    } else {
                      setFormData(prev => ({ ...prev, votesPerUser: null }));
                    }
                  }}
                  style={s.checkbox}
                />
                <span style={{ marginLeft: '0.5rem', fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.95rem', color: '#0F0D0B' }}>
                  Limit votes per user
                </span>
              </label>

              {formData.votesPerUser !== null && formData.votesPerUser !== undefined && (
                <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                  <p style={{ ...s.hint, marginBottom: '0.5rem' }}>Each user can vote on:</p>
                  <div style={{ display: 'flex', gap: '1.5rem' }}>
                    {[1, 2, 4].map(n => (
                      <label key={n} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="votesPerUser"
                          value={n}
                          checked={Number(formData.votesPerUser) === n}
                          onChange={(e) => setFormData(prev => ({ ...prev, votesPerUser: Number(e.target.value) }))}
                          style={s.radio}
                        />
                        <span style={{ marginLeft: '0.375rem', fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.9rem', color: '#0F0D0B' }}>{n} comment{n > 1 ? 's' : ''}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Starter Data Configuration */}
            <div>
              <h4 style={{ ...s.label, marginBottom: '0.25rem' }}>Starter Data (Optional)</h4>
              <p style={{ ...s.hint, marginBottom: '0.75rem' }}>
                {formData.activityType === 'dissolve'
                  ? 'Add initial data points to seed the activity. Format: JSON array with x, y (0-1), objectName, and comment fields.'
                  : 'Add initial data points to seed the activity. Format: JSON array with quadrant (1-4), objectName, and comment fields.'}
              </p>

              <div>
                <label htmlFor="starterData" style={s.label}>Starter Data JSON</label>
                <textarea
                  id="starterData"
                  value={formData.starterData}
                  onChange={(e) => handleFieldChange('starterData', e.target.value)}
                  style={{ ...s.input, fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.85rem', resize: 'vertical' as const }}
                  placeholder={formData.activityType === 'dissolve'
                    ? '[{"x": 0.7, "y": 0.3, "objectName": "Gratitude", "comment": "Daily journaling helps me stay grounded"}]'
                    : '[{"quadrant": 1, "objectName": "Gratitude", "comment": "Daily journaling helps me stay grounded"}]'}
                  rows={6}
                />
                {validationErrors.starterData && <p style={s.error}>{validationErrors.starterData}</p>}
                {formData.activityType === 'dissolve' ? (
                  <p style={s.hint}>Fields: x (0-1), y (0-1), objectName, comment</p>
                ) : (
                  <div style={s.hint}>
                    <p>Fields: quadrant, objectName, comment</p>
                    <p>Quadrants: 1=Top-Right, 2=Top-Left, 3=Bottom-Left, 4=Bottom-Right</p>
                  </div>
                )}

                {/* Sync Starter Data Button */}
                {editingActivity && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={handleSyncStarterData}
                      disabled={isSyncing}
                      style={{
                        padding: '0.4rem 0.75rem',
                        background: isSyncing ? '#D9D4CC' : '#2a9d6f',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-dm-mono), monospace',
                        fontSize: '0.65rem',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        cursor: isSyncing ? 'not-allowed' : 'pointer',
                        transition: 'background 0.2s',
                      }}
                    >
                      {isSyncing ? 'Syncing...' : 'Sync to Database'}
                    </button>
                    <p style={s.hint}>Updates database records to match the starter data above</p>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* Sync Message */}
          {syncMessage && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: '4px',
              border: `1px solid ${syncMessage.includes('successfully') ? 'rgba(42, 157, 111, 0.3)' : 'rgba(200, 59, 80, 0.3)'}`,
              background: syncMessage.includes('successfully') ? 'rgba(42, 157, 111, 0.06)' : 'rgba(200, 59, 80, 0.06)',
            }}>
              <p style={{ fontSize: '0.9rem', color: syncMessage.includes('successfully') ? '#2a9d6f' : '#C83B50', fontFamily: 'var(--font-cormorant), Georgia, serif' }}>
                {syncMessage}
              </p>
            </div>
          )}

          {/* Submit Error */}
          {submitError && (
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(200, 59, 80, 0.06)', border: '1px solid rgba(200, 59, 80, 0.3)', borderRadius: '4px' }}>
              <p style={{ color: '#C83B50', fontSize: '0.9rem', fontFamily: 'var(--font-cormorant), Georgia, serif' }}>{submitError}</p>
            </div>
          )}

          {/* Form Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid #D9D4CC' }}>
            {onCancel && (
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: '0.625rem 1.25rem',
                  background: 'transparent',
                  color: '#6B6560',
                  border: '1px solid #D9D4CC',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-dm-mono), monospace',
                  fontSize: '0.75rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '0.625rem 1.5rem',
                background: isSubmitting ? '#D9D4CC' : '#C83B50',
                color: isSubmitting ? '#6B6560' : '#fff',
                border: 'none',
                borderRadius: '4px',
                fontFamily: 'var(--font-dm-mono), monospace',
                fontSize: '0.75rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {isSubmitting
                ? 'Saving...'
                : editingActivity
                  ? 'Update Activity'
                  : 'Create Activity'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
