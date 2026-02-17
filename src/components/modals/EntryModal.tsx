'use client';

import { useState, useEffect } from 'react';
import { HoloscopicActivity, Rating, Comment } from '@/models/Activity';
import QuadrantSelector from '@/components/activities/resolve/QuadrantSelector';
import { normalizeActivityType } from '@/components/activities/types';

interface EntryModalProps {
  activity: HoloscopicActivity;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    objectName: string;
    position: { x: number; y: number };
    comment: string;
  }) => void;
  slotNumber: number;
  existingData?: {
    objectName?: string;
    rating?: Rating;
    comment?: Comment;
  };
}

export default function EntryModal({
  activity,
  isOpen,
  onClose,
  onSubmit,
  slotNumber,
  existingData
}: EntryModalProps) {
  const activityType = normalizeActivityType(activity.activityType || 'dissolve');
  const totalSteps = activityType === 'resolve' ? 3 : 4; // resolve: Name, Quadrant, Comment | dissolve: Name, Slider1, Slider2, Comment

  const [step, setStep] = useState(1);
  const [objectName, setObjectName] = useState('');
  const [xValue, setXValue] = useState(0.5);
  const [yValue, setYValue] = useState(0.5);
  const [comment, setComment] = useState('');

  // Reset state when modal opens/closes or slot changes
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setObjectName(existingData?.objectName || '');
      setXValue(existingData?.rating?.position.x ?? 0.5);
      setYValue(existingData?.rating?.position.y ?? 0.5);
      setComment(existingData?.comment?.text || '');
    }
  }, [isOpen, slotNumber, existingData]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (step === 1 && !objectName.trim()) {
      alert('Please enter a name for your perspective');
      return;
    }
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      // Final submit
      onSubmit({ objectName, position: { x: xValue, y: yValue }, comment });
    }
  };

  const handlePrevious = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleCancel = () => {
    if (window.confirm('Close without saving? Your changes will be lost.')) {
      onClose();
    }
  };

  const progressPercent = (step / totalSteps) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[#252120] border border-[rgba(215,205,195,0.12)] rounded-lg shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        {/* Header with Progress */}
        <div className="border-b border-[rgba(215,205,195,0.12)] p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-[#F5F0EB]" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              Entry {slotNumber} &mdash; Step {step} of {totalSteps}
            </h2>
            <button
              onClick={handleCancel}
              className="text-[#7A7068] hover:text-[#F5F0EB] text-2xl leading-none transition-colors"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
          {/* Progress Bar */}
          <div className="w-full bg-[rgba(215,205,195,0.1)] rounded-full h-2">
            <div
              className="bg-[#C83B50] h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Content (scrollable) */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Object Name */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-[#F5F0EB] mb-2" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase' }}>
                {activity.objectNameQuestion || "Name something that represents your perspective"}
              </h3>
              <p className="text-[#7A7068] text-sm mb-4" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', fontWeight: 300, letterSpacing: '0.08em' }}>
                Choose a name that will appear with your responses (max 25 characters)
              </p>
              <input
                type="text"
                value={objectName}
                onChange={(e) => setObjectName(e.target.value.slice(0, 25))}
                className="w-full px-4 py-3 bg-[#1A1714] border border-[rgba(215,205,195,0.12)] text-[#F5F0EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C83B50] text-lg"
                style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}
                placeholder="Enter name..."
                maxLength={25}
                autoFocus
              />
              <p className="text-xs text-[#7A7068] text-right" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.55rem' }}>
                {objectName.length}/25 characters
              </p>
            </div>
          )}

          {/* Step 2: Quadrant Selector (resolve) OR X-Axis Slider (dissolve) */}
          {step === 2 && activityType === 'resolve' && (
            <div className="space-y-4">
              <div className="mb-2">
                <span className="text-sm text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your perspective:</span>
                <p className="text-lg font-semibold text-[#C83B50]" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>{objectName}</p>
              </div>
              <QuadrantSelector
                activity={activity}
                onQuadrantSelect={({ x, y }) => {
                  setXValue(x);
                  setYValue(y);
                }}
                userRating={existingData?.rating}
              />
            </div>
          )}

          {step === 2 && activityType === 'dissolve' && (
            <div className="space-y-4">
              <div className="mb-2">
                <span className="text-sm text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your perspective:</span>
                <p className="text-lg font-semibold text-[#C83B50]" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>{objectName}</p>
              </div>
              <h3 className="text-2xl font-bold text-[#F5F0EB] mb-4" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase' }}>
                {activity.mapQuestion}
              </h3>
              <div className="bg-[#1A1714] border border-[rgba(215,205,195,0.12)] p-6 rounded-lg">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={xValue}
                  onChange={(e) => setXValue(parseFloat(e.target.value))}
                  inputMode="none"
                  className="w-full h-2 bg-[rgba(215,205,195,0.15)] rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-sm font-semibold text-[#A89F96] mt-4" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.65rem' }}>
                  <span>{activity.xAxis.min}</span>
                  <span>{activity.xAxis.max}</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Comment (resolve) OR Y-Axis Slider (dissolve) */}
          {step === 3 && activityType === 'resolve' && (
            <div className="space-y-4">
              <div className="mb-2">
                <span className="text-sm text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your perspective:</span>
                <p className="text-lg font-semibold text-[#C83B50]" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>{objectName}</p>
              </div>
              <h3 className="text-2xl font-bold text-[#F5F0EB] mb-2" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase' }}>
                {activity.commentQuestion}
              </h3>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full px-4 py-3 bg-[#1A1714] border border-[rgba(215,205,195,0.12)] text-[#F5F0EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C83B50] text-base resize-none"
                style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}
                placeholder="Share your thoughts..."
                rows={6}
                autoFocus
              />
            </div>
          )}

          {step === 3 && activityType === 'dissolve' && (
            <div className="space-y-4">
              <div className="mb-2">
                <span className="text-sm text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your perspective:</span>
                <p className="text-lg font-semibold text-[#C83B50]" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>{objectName}</p>
              </div>
              <h3 className="text-2xl font-bold text-[#F5F0EB] mb-4" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase' }}>
                {activity.mapQuestion2 || activity.mapQuestion}
              </h3>
              <div className="bg-[#1A1714] border border-[rgba(215,205,195,0.12)] p-6 rounded-lg">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={yValue}
                  onChange={(e) => setYValue(parseFloat(e.target.value))}
                  inputMode="none"
                  className="w-full h-2 bg-[rgba(215,205,195,0.15)] rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-sm font-semibold text-[#A89F96] mt-4" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.65rem' }}>
                  <span>{activity.yAxis.min}</span>
                  <span>{activity.yAxis.max}</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Comment (holoscopic only) */}
          {step === 4 && activityType === 'dissolve' && (
            <div className="space-y-4">
              <div className="mb-2">
                <span className="text-sm text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your perspective:</span>
                <p className="text-lg font-semibold text-[#C83B50]" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>{objectName}</p>
              </div>
              <h3 className="text-2xl font-bold text-[#F5F0EB] mb-2" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase' }}>
                {activity.commentQuestion}
              </h3>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 500))}
                className="w-full px-4 py-3 bg-[#1A1714] border border-[rgba(215,205,195,0.12)] text-[#F5F0EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C83B50] min-h-[150px] resize-none"
                style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}
                placeholder="Share your thoughts..."
                maxLength={500}
              />
              <p className="text-xs text-[#7A7068] text-right" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.55rem' }}>
                {comment.length}/500 characters
              </p>
            </div>
          )}
        </div>

        {/* Footer with Navigation */}
        <div className="border-t border-[rgba(215,205,195,0.12)] p-4 flex gap-3">
          <button
            onClick={handlePrevious}
            disabled={step === 1}
            className="px-6 py-3 bg-[rgba(215,205,195,0.1)] hover:bg-[rgba(215,205,195,0.18)] text-[#F5F0EB] font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.7rem', fontWeight: 300, letterSpacing: '0.12em', textTransform: 'uppercase' }}
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            className="flex-1 px-6 py-3 bg-[#C83B50] hover:bg-[#B03248] text-white font-medium rounded-lg transition-colors"
            style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.7rem', fontWeight: 300, letterSpacing: '0.12em', textTransform: 'uppercase' }}
          >
            {step === totalSteps ? 'Submit' : 'Next'}
          </button>
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #C83B50;
          border: 2px solid #F5F0EB;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #C83B50;
          border: 2px solid #F5F0EB;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .slider:focus {
          outline: none;
        }
      `}</style>
    </div>
  );
}
