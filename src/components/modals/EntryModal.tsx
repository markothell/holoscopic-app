'use client';

import { useState, useEffect } from 'react';
import { HoloscopicActivity, Rating, Comment } from '@/models/Activity';

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
  const [step, setStep] = useState(1); // 1: Name, 2: Slider1, 3: Slider2, 4: Comment
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
    if (step < 4) {
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

  const totalSteps = 4;
  const progressPercent = (step / totalSteps) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-slate-800 rounded-lg shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        {/* Header with Progress */}
        <div className="border-b border-slate-700 p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-white">
              Entry {slotNumber} - Step {step} of {totalSteps}
            </h2>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-white text-2xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {/* Progress Bar */}
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Content (scrollable) */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Object Name */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-white mb-2">
                {activity.objectNameQuestion || "Name something that represents your perspective"}
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                Choose a name that will appear with your responses (max 25 characters)
              </p>
              <input
                type="text"
                value={objectName}
                onChange={(e) => setObjectName(e.target.value.slice(0, 25))}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                placeholder="Enter name..."
                maxLength={25}
                autoFocus
              />
              <p className="text-xs text-gray-500 text-right">
                {objectName.length}/25 characters
              </p>
            </div>
          )}

          {/* Step 2: X-Axis Slider */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="mb-2">
                <span className="text-sm text-gray-400">Your perspective:</span>
                <p className="text-lg font-semibold text-blue-400">{objectName}</p>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">
                {activity.mapQuestion}
              </h3>
              <div className="bg-slate-700 p-6 rounded-lg">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={xValue}
                  onChange={(e) => setXValue(parseFloat(e.target.value))}
                  inputMode="none"
                  className="w-full h-2 bg-slate-500 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-sm font-semibold text-gray-300 mt-4">
                  <span>{activity.xAxis.min}</span>
                  <span>{activity.xAxis.max}</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Y-Axis Slider */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="mb-2">
                <span className="text-sm text-gray-400">Your perspective:</span>
                <p className="text-lg font-semibold text-blue-400">{objectName}</p>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">
                {activity.mapQuestion2 || activity.mapQuestion}
              </h3>
              <div className="bg-slate-700 p-6 rounded-lg">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={yValue}
                  onChange={(e) => setYValue(parseFloat(e.target.value))}
                  inputMode="none"
                  className="w-full h-2 bg-slate-500 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-sm font-semibold text-gray-300 mt-4">
                  <span>{activity.yAxis.min}</span>
                  <span>{activity.yAxis.max}</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Comment */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="mb-2">
                <span className="text-sm text-gray-400">Your perspective:</span>
                <p className="text-lg font-semibold text-blue-400">{objectName}</p>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">
                {activity.commentQuestion}
              </h3>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 500))}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[150px] resize-none"
                placeholder="Share your thoughts..."
                maxLength={500}
              />
              <p className="text-xs text-gray-500 text-right">
                {comment.length}/500 characters
              </p>
            </div>
          )}
        </div>

        {/* Footer with Navigation */}
        <div className="border-t border-slate-700 p-4 flex gap-3">
          <button
            onClick={handlePrevious}
            disabled={step === 1}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            className="flex-1 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
          >
            {step === 4 ? 'Submit' : 'Next'}
          </button>
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          border: 2px solid white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          border: 2px solid white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider:focus {
          outline: none;
        }
      `}</style>
    </div>
  );
}
