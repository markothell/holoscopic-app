'use client';

import { useState, useEffect } from 'react';
import { HoloscopicActivity, ActivityFormData, ActivityType } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';
import { ValidationService } from '@/utils/validation';
import { UrlUtils } from '@/utils/urlUtils';
import { useAuth } from '@/contexts/AuthContext';
import CollapsibleSection from './CollapsibleSection';
import { ACTIVITY_TYPES } from './activities/types';

interface AdminPanelProps {
  editingActivity?: HoloscopicActivity;
  onActivityCreated?: (activity: HoloscopicActivity) => void;
  onActivityUpdated?: (activity: HoloscopicActivity) => void;
  onCancel?: () => void;
}

// Get default form data based on activity type
const getDefaultFormData = (activityType: ActivityType): ActivityFormData => {
  if (activityType === 'findthecenter') {
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
    };
  }

  // holoscopic defaults
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
  const [selectedType, setSelectedType] = useState<ActivityType | null>(editingActivity ? editingActivity.activityType || 'holoscopic' : null);

  const [formData, setFormData] = useState<ActivityFormData>(getDefaultFormData('holoscopic'));

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Populate form when editing
  useEffect(() => {
    if (editingActivity) {
      const activityType = editingActivity.activityType || 'holoscopic';
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
            // Still call onActivityCreated even if author setting fails
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
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Create New Activity</h2>
            <p className="text-gray-600 mt-2">Select an activity type to get started</p>
          </div>

          {/* Activity Type Selection */}
          <div className="space-y-4">
            {Object.values(ACTIVITY_TYPES).map((type) => (
              <button
                key={type.id}
                onClick={() => handleTypeSelect(type.id)}
                className="w-full p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
              >
                <h3 className="text-lg font-semibold text-gray-800">{type.label}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {type.id === 'holoscopic'
                    ? 'Two slider questions to position responses on X and Y axes. Best for continuous 2D mapping.'
                    : '4-quadrant selector with gravity-based clustering. Best for categorical positioning.'}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Screens: {type.screens.join(' → ')}
                </p>
              </button>
            ))}
          </div>

          {/* Cancel Button */}
          {onCancel && (
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
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
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                {editingActivity ? 'Edit Activity' : 'Create New Activity'}
              </h2>
              <p className="text-gray-600 mt-1">
                {ACTIVITY_TYPES[formData.activityType]?.label || 'Activity'} Configuration
              </p>
            </div>
            {!editingActivity && (
              <button
                type="button"
                onClick={() => setSelectedType(null)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Change Type
              </button>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Entry Section */}
          <CollapsibleSection title="Entry" defaultOpen={false}>
            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Activity Title
              </label>
              <input
                type="text"
                id="title"
                value={formData.title}
                onChange={(e) => handleFieldChange('title', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                placeholder="e.g., Gratitude Mapping"
                maxLength={100}
              />
              {validationErrors.title && (
                <p className="text-red-600 text-sm mt-1">{validationErrors.title}</p>
              )}
            </div>

            {/* URL Name */}
            <div>
              <label htmlFor="urlName" className="block text-sm font-medium text-gray-700 mb-2">
                URL Name
              </label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">holoscopic.io/</span>
                <input
                  type="text"
                  id="urlName"
                  value={formData.urlName || ''}
                  onChange={(e) => handleFieldChange('urlName', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  placeholder="e.g., gratitude"
                  maxLength={50}
                />
              </div>
              <p className="text-gray-500 text-sm mt-1">
                {formData.urlName ?
                  `URL: holoscopic.io/${UrlUtils.cleanActivityName(formData.urlName)}` :
                  'Leave empty to auto-generate from title'
                }
              </p>
              {validationErrors.urlName && (
                <p className="text-red-600 text-sm mt-1">{validationErrors.urlName}</p>
              )}
            </div>

            {/* Public/Private Access */}
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isPublic || false}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, isPublic: e.target.checked }));
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">Make activity public (no login required)</span>
              </label>
              <p className="text-gray-500 text-xs ml-6">
                Public activities can be accessed by anyone without creating an account. Private activities require authentication.
              </p>
            </div>

            {/* Preamble (Optional) */}
            <div>
              <label htmlFor="preamble" className="block text-sm font-medium text-gray-700 mb-2">
                Activity Description (Optional)
              </label>
              <textarea
                id="preamble"
                value={formData.preamble || ''}
                onChange={(e) => handleFieldChange('preamble', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                placeholder="e.g., This activity explores our relationship with gratitude..."
                maxLength={500}
                rows={3}
              />
              <p className="text-gray-500 text-xs mt-1">A short paragraph shown on the activity entry page</p>
              {validationErrors.preamble && (
                <p className="text-red-600 text-sm mt-1">{validationErrors.preamble}</p>
              )}
            </div>

            {/* Wiki Link (Optional) */}
            <div>
              <label htmlFor="wikiLink" className="block text-sm font-medium text-gray-700 mb-2">
                Wiki Page Link (Optional)
              </label>
              <input
                type="text"
                id="wikiLink"
                value={formData.wikiLink || ''}
                onChange={(e) => handleFieldChange('wikiLink', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                placeholder="e.g., http://holoscopic.io/wiki/gratitude"
                maxLength={200}
              />
              <p className="text-gray-500 text-xs mt-1">Link to the wiki page for more information about this activity</p>
              {validationErrors.wikiLink && (
                <p className="text-red-600 text-sm mt-1">{validationErrors.wikiLink}</p>
              )}
            </div>
          </CollapsibleSection>

          {/* Map Axes Section - Only for holoscopic activity type */}
          {formData.activityType === 'holoscopic' && (
            <CollapsibleSection title="Map Axes" defaultOpen={false}>
              {/* X-Axis Configuration */}
              <div className="space-y-4">
                <h4 className="text-md font-semibold text-gray-800">X-Axis Configuration</h4>

                <div>
                  <label htmlFor="xAxisLabel" className="block text-sm font-medium text-gray-700 mb-2">
                    X-Axis Label
                  </label>
                  <input
                    type="text"
                    id="xAxisLabel"
                    value={formData.xAxisLabel}
                    onChange={(e) => handleFieldChange('xAxisLabel', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                    placeholder="e.g., ...do you have now?"
                    maxLength={50}
                  />
                  {validationErrors.xAxisLabel && (
                    <p className="text-red-600 text-sm mt-1">{validationErrors.xAxisLabel}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="xAxisMin" className="block text-sm font-medium text-gray-700 mb-2">
                      X-Axis Minimum
                    </label>
                    <input
                      type="text"
                      id="xAxisMin"
                      value={formData.xAxisMin}
                      onChange={(e) => handleFieldChange('xAxisMin', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                      placeholder="e.g., None"
                      maxLength={30}
                    />
                    {validationErrors.xAxisMin && (
                      <p className="text-red-600 text-sm mt-1">{validationErrors.xAxisMin}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="xAxisMax" className="block text-sm font-medium text-gray-700 mb-2">
                      X-Axis Maximum
                    </label>
                    <input
                      type="text"
                      id="xAxisMax"
                      value={formData.xAxisMax}
                      onChange={(e) => handleFieldChange('xAxisMax', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                      placeholder="e.g., So much"
                      maxLength={30}
                    />
                    {validationErrors.xAxisMax && (
                      <p className="text-red-600 text-sm mt-1">{validationErrors.xAxisMax}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Y-Axis Configuration */}
              <div className="space-y-4">
                <h4 className="text-md font-semibold text-gray-800">Y-Axis Configuration</h4>

                <div>
                  <label htmlFor="yAxisLabel" className="block text-sm font-medium text-gray-700 mb-2">
                    Y-Axis Label
                  </label>
                  <input
                    type="text"
                    id="yAxisLabel"
                    value={formData.yAxisLabel}
                    onChange={(e) => handleFieldChange('yAxisLabel', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                    placeholder="e.g., ...did you have as a kid?"
                    maxLength={50}
                  />
                  {validationErrors.yAxisLabel && (
                    <p className="text-red-600 text-sm mt-1">{validationErrors.yAxisLabel}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="yAxisMin" className="block text-sm font-medium text-gray-700 mb-2">
                      Y-Axis Minimum
                    </label>
                    <input
                      type="text"
                      id="yAxisMin"
                      value={formData.yAxisMin}
                      onChange={(e) => handleFieldChange('yAxisMin', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                      placeholder="e.g., None"
                      maxLength={30}
                    />
                    {validationErrors.yAxisMin && (
                      <p className="text-red-600 text-sm mt-1">{validationErrors.yAxisMin}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="yAxisMax" className="block text-sm font-medium text-gray-700 mb-2">
                      Y-Axis Maximum
                    </label>
                    <input
                      type="text"
                      id="yAxisMax"
                      value={formData.yAxisMax}
                      onChange={(e) => handleFieldChange('yAxisMax', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                      placeholder="e.g., So much"
                      maxLength={30}
                    />
                    {validationErrors.yAxisMax && (
                      <p className="text-red-600 text-sm mt-1">{validationErrors.yAxisMax}</p>
                    )}
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Axis Endpoints Section - Only for findthecenter activity type */}
          {formData.activityType === 'findthecenter' && (
            <CollapsibleSection title="Axis Endpoints" defaultOpen={false}>
              <p className="text-sm text-gray-600 mb-4">
                These labels will appear on the quadrant grid selector and results view.
              </p>

              {/* Horizontal Axis */}
              <div className="space-y-4">
                <h4 className="text-md font-semibold text-gray-800">Horizontal Axis</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="xAxisMin" className="block text-sm font-medium text-gray-700 mb-2">
                      Left Label
                    </label>
                    <input
                      type="text"
                      id="xAxisMin"
                      value={formData.xAxisMin}
                      onChange={(e) => handleFieldChange('xAxisMin', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                      placeholder="e.g., Left"
                      maxLength={30}
                    />
                    {validationErrors.xAxisMin && (
                      <p className="text-red-600 text-sm mt-1">{validationErrors.xAxisMin}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="xAxisMax" className="block text-sm font-medium text-gray-700 mb-2">
                      Right Label
                    </label>
                    <input
                      type="text"
                      id="xAxisMax"
                      value={formData.xAxisMax}
                      onChange={(e) => handleFieldChange('xAxisMax', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                      placeholder="e.g., Right"
                      maxLength={30}
                    />
                    {validationErrors.xAxisMax && (
                      <p className="text-red-600 text-sm mt-1">{validationErrors.xAxisMax}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Vertical Axis */}
              <div className="space-y-4">
                <h4 className="text-md font-semibold text-gray-800">Vertical Axis</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="yAxisMin" className="block text-sm font-medium text-gray-700 mb-2">
                      Bottom Label
                    </label>
                    <input
                      type="text"
                      id="yAxisMin"
                      value={formData.yAxisMin}
                      onChange={(e) => handleFieldChange('yAxisMin', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                      placeholder="e.g., Bottom"
                      maxLength={30}
                    />
                    {validationErrors.yAxisMin && (
                      <p className="text-red-600 text-sm mt-1">{validationErrors.yAxisMin}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="yAxisMax" className="block text-sm font-medium text-gray-700 mb-2">
                      Top Label
                    </label>
                    <input
                      type="text"
                      id="yAxisMax"
                      value={formData.yAxisMax}
                      onChange={(e) => handleFieldChange('yAxisMax', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                      placeholder="e.g., Top"
                      maxLength={30}
                    />
                    {validationErrors.yAxisMax && (
                      <p className="text-red-600 text-sm mt-1">{validationErrors.yAxisMax}</p>
                    )}
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Naming Section */}
          <CollapsibleSection title="Naming" defaultOpen={false}>
            {/* Object Name Question */}
            <div>
              <label htmlFor="objectNameQuestion" className="block text-sm font-medium text-gray-700 mb-2">
                Object Name Question
              </label>
              <input
                type="text"
                id="objectNameQuestion"
                value={formData.objectNameQuestion}
                onChange={(e) => handleFieldChange('objectNameQuestion', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                placeholder="e.g., Name something that represents your perspective"
                maxLength={200}
              />
              {validationErrors.objectNameQuestion && (
                <p className="text-red-600 text-sm mt-1">{validationErrors.objectNameQuestion}</p>
              )}
            </div>

            {/* Multi-Entry Configuration */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Entry Slots per User</h4>
              <p className="text-sm text-gray-600">Allow users to submit multiple entries in this activity</p>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="maxEntries"
                    value="1"
                    checked={Number(formData.maxEntries) === 1}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxEntries: Number(e.target.value) }))}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">1 entry</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="maxEntries"
                    value="2"
                    checked={Number(formData.maxEntries) === 2}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxEntries: Number(e.target.value) }))}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">2 entries</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="maxEntries"
                    value="4"
                    checked={Number(formData.maxEntries) === 4}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxEntries: Number(e.target.value) }))}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">4 entries</span>
                </label>
              </div>
            </div>
          </CollapsibleSection>

          {/* Positioning Questions Section - differs by activity type */}
          <CollapsibleSection
            title={formData.activityType === 'holoscopic' ? 'Slider Questions' : 'Quadrant Question'}
            defaultOpen={false}
          >
            {/* Map Question 1 (used for both types) */}
            <div>
              <label htmlFor="mapQuestion" className="block text-sm font-medium text-gray-700 mb-2">
                {formData.activityType === 'holoscopic' ? 'First Slider Question' : 'Quadrant Selection Question'}
              </label>
              <input
                type="text"
                id="mapQuestion"
                value={formData.mapQuestion}
                onChange={(e) => handleFieldChange('mapQuestion', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                placeholder={formData.activityType === 'holoscopic'
                  ? "e.g., How much money did you have as a kid?"
                  : "e.g., Which quadrant best represents your perspective?"}
                maxLength={200}
              />
              {validationErrors.mapQuestion && (
                <p className="text-red-600 text-sm mt-1">{validationErrors.mapQuestion}</p>
              )}
            </div>

            {/* Map Question 2 - Only for holoscopic type */}
            {formData.activityType === 'holoscopic' && (
              <div>
                <label htmlFor="mapQuestion2" className="block text-sm font-medium text-gray-700 mb-2">
                  Second Slider Question
                </label>
                <input
                  type="text"
                  id="mapQuestion2"
                  value={formData.mapQuestion2}
                  onChange={(e) => handleFieldChange('mapQuestion2', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  placeholder="e.g., How much money do you have now?"
                  maxLength={200}
                />
                {validationErrors.mapQuestion2 && (
                  <p className="text-red-600 text-sm mt-1">{validationErrors.mapQuestion2}</p>
                )}
              </div>
            )}
          </CollapsibleSection>

          {/* Comment Section */}
          <CollapsibleSection title="Comment" defaultOpen={false}>
            {/* Comment Question */}
            <div>
              <label htmlFor="commentQuestion" className="block text-sm font-medium text-gray-700 mb-2">
                Comment Question
              </label>
              <input
                type="text"
                id="commentQuestion"
                value={formData.commentQuestion}
                onChange={(e) => handleFieldChange('commentQuestion', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                placeholder="e.g., How do you express gratitude?"
                maxLength={200}
              />
              {validationErrors.commentQuestion && (
                <p className="text-red-600 text-sm mt-1">{validationErrors.commentQuestion}</p>
              )}
            </div>
          </CollapsibleSection>

          {/* Results Section */}
          <CollapsibleSection title="Results" defaultOpen={false}>
            {/* Profile Links Toggle */}
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.showProfileLinks ?? true}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, showProfileLinks: e.target.checked }));
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">Show profile links in results</span>
              </label>
              <p className="text-gray-500 text-xs ml-6">
                When enabled, authenticated users will see clickable profile icons next to comments in the results view.
              </p>
            </div>

            {/* Vote Limit Configuration */}
            <div className="space-y-3">
              <label className="flex items-center">
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
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">Limit votes per user</span>
              </label>

              {formData.votesPerUser !== null && formData.votesPerUser !== undefined && (
                <div className="ml-6 space-y-2">
                  <p className="text-sm text-gray-600">Each user can vote on:</p>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="votesPerUser"
                        value="1"
                        checked={Number(formData.votesPerUser) === 1}
                        onChange={(e) => setFormData(prev => ({ ...prev, votesPerUser: Number(e.target.value) }))}
                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">1 comment</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="votesPerUser"
                        value="2"
                        checked={Number(formData.votesPerUser) === 2}
                        onChange={(e) => setFormData(prev => ({ ...prev, votesPerUser: Number(e.target.value) }))}
                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">2 comments</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="votesPerUser"
                        value="4"
                        checked={Number(formData.votesPerUser) === 4}
                        onChange={(e) => setFormData(prev => ({ ...prev, votesPerUser: Number(e.target.value) }))}
                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">4 comments</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Starter Data Configuration */}
            <div className="space-y-4">
              <h4 className="text-md font-semibold text-gray-800">Starter Data (Optional)</h4>
              <p className="text-sm text-gray-600 mb-4">
                {formData.activityType === 'holoscopic'
                  ? 'Add initial data points to seed the activity. Format: JSON array with x, y (0-1), objectName, and comment fields.'
                  : 'Add initial data points to seed the activity. Format: JSON array with quadrant (1-4), objectName, and comment fields.'}
              </p>

              <div>
                <label htmlFor="starterData" className="block text-sm font-medium text-gray-700 mb-2">
                  Starter Data JSON
                </label>
                <textarea
                  id="starterData"
                  value={formData.starterData}
                  onChange={(e) => handleFieldChange('starterData', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black font-mono text-sm"
                  placeholder={formData.activityType === 'holoscopic'
                    ? '[{"x": 0.7, "y": 0.3, "objectName": "Gratitude", "comment": "Daily journaling helps me stay grounded"}]'
                    : '[{"quadrant": 1, "objectName": "Gratitude", "comment": "Daily journaling helps me stay grounded"}]'}
                  rows={6}
                />
                {validationErrors.starterData && (
                  <p className="text-red-600 text-sm mt-1">{validationErrors.starterData}</p>
                )}
                {formData.activityType === 'holoscopic' ? (
                  <p className="text-xs text-gray-500 mt-2">
                    Fields: x (0-1), y (0-1), objectName, comment
                  </p>
                ) : (
                  <div className="text-xs text-gray-500 mt-2 space-y-1">
                    <p>Fields: quadrant, objectName, comment</p>
                    <p>Quadrants: 1=Top-Right, 2=Top-Left, 3=Bottom-Left, 4=Bottom-Right</p>
                  </div>
                )}

                {/* Sync Starter Data Button - only show when editing */}
                {editingActivity && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={handleSyncStarterData}
                      disabled={isSyncing}
                      className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSyncing ? 'Syncing...' : 'Sync to Database'}
                    </button>
                    <p className="text-xs text-gray-500 mt-1">
                      Updates database records to match the starter data above
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* Sync Message */}
          {syncMessage && (
            <div className={`p-4 border rounded-md ${
              syncMessage.includes('successfully')
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <p className={`text-sm ${
                syncMessage.includes('successfully')
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                {syncMessage}
              </p>
            </div>
          )}

          {/* Submit Error */}
          {submitError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm">{submitError}</p>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4">
            {onCancel && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
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