'use client';

'use client';

import { useState, useEffect } from 'react';
import { HoloscopicActivity, Rating, Comment, SnapshotAnswer, SnapshotQuestion } from '@/models/Activity';
import { normalizeActivityType } from '@/components/activities/types';
import { REGISTRY } from '@/components/activities/registry';

interface EntryModalProps {
  activity: HoloscopicActivity;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    objectName: string;
    position: { x: number; y: number };
    comment: string;
    snapshotAnswers?: SnapshotAnswer[];
  }) => void;
  onDelete?: () => void;
  slotNumber: number;
  existingData?: {
    objectName?: string;
    rating?: Rating;
    comment?: Comment;
  };
  // Snapshot single-question mode: when set, the modal handles only this question
  snapshotQuestion?: SnapshotQuestion;
}

export default function EntryModal({
  activity,
  isOpen,
  onClose,
  onSubmit,
  onDelete,
  slotNumber,
  existingData,
  snapshotQuestion,
}: EntryModalProps) {
  const activityType = normalizeActivityType(activity.activityType || 'dissolve');
  const { commentMaxLength, PositioningSteps } = REGISTRY[activityType];
  // Snapshot single-question mode = 4 steps; full snapshot = 4 per question; others from registry
  const totalSteps = activityType === 'snapshot'
    ? 4
    : REGISTRY[activityType].totalSteps;

  const [step, setStep] = useState(1);
  const [objectName, setObjectName] = useState('');
  const [xValue, setXValue] = useState(0.5);
  const [yValue, setYValue] = useState(0.5);
  const [comment, setComment] = useState('');
  const [snapshotAnswers, setSnapshotAnswers] = useState<SnapshotAnswer[]>([]);

  // Only initialise form fields when the modal opens or the slot changes.
  // Deliberately omitting existingData from deps: we don't want a mid-session
  // WebSocket activity update (e.g. after joinActivity) to reset what the user typed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setObjectName(existingData?.objectName || '');
      setXValue(existingData?.rating?.position.x ?? 0.5);
      setYValue(existingData?.rating?.position.y ?? 0.5);
      setComment(existingData?.comment?.text || '');
      setSnapshotAnswers([]);
    }
  }, [isOpen, slotNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const isLastStep = step === totalSteps;
  // Snapshot handles all positioning AND comments within PositioningSteps — no shared name or comment step
  const isSnapshotType = activityType === 'snapshot';
  const isPositioningStep = isSnapshotType ? true : (step > 1 && !isLastStep);
  const progressPercent = (step / totalSteps) * 100;

  const handleNext = () => {
    if (step === 1 && !isSnapshotType && !objectName.trim()) {
      alert('Please enter a name for your perspective');
      return;
    }
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      onSubmit({
        objectName,
        position: { x: xValue, y: yValue },
        comment,
        ...(activityType === 'snapshot' && snapshotAnswers.length > 0 && { snapshotAnswers }),
      });
    }
  };

  const handlePrevious = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[#252120] border border-[rgba(215,205,195,0.12)] rounded-lg shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        {/* Header with Progress */}
        <div className="border-b border-[rgba(215,205,195,0.12)] p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-[#F5F0EB] flex items-center gap-2" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              {snapshotQuestion ? (
                <>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: snapshotQuestion.color, flexShrink: 0 }} />
                  {snapshotQuestion.topic || snapshotQuestion.label} &mdash; Step {step} of {totalSteps}
                </>
              ) : (
                <>Entry {slotNumber} &mdash; Step {step} of {totalSteps}</>
              )}
            </h2>
            <button
              onClick={handleCancel}
              className="text-[#7A7068] hover:text-[#F5F0EB] text-2xl leading-none transition-colors"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
          <div className="w-full bg-[rgba(215,205,195,0.1)] rounded-full h-2">
            <div
              className="bg-[#C83B50] h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Object Name (non-snapshot types only; snapshot uses question labels as names) */}
          {step === 1 && !isSnapshotType && (
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-[#F5F0EB] mb-2" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase' }}>
                {activity.objectNameQuestion || 'Name something that represents your perspective'}
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

          {/* Positioning steps: delegated to type-specific component */}
          {isPositioningStep && (
            <PositioningSteps
              activity={activity}
              step={step}
              xValue={xValue}
              yValue={yValue}
              onXChange={setXValue}
              onYChange={setYValue}
              objectName={objectName}
              existingRating={existingData?.rating}
              existingComment={existingData?.comment}
              onSnapshotAnswersChange={setSnapshotAnswers}
              snapshotQuestionId={snapshotQuestion?.id}
            />
          )}

          {/* Last step: Comment (shared across all types except snapshot) */}
          {isLastStep && !isSnapshotType && (
            <div className="space-y-4">
              <div className="mb-2">
                <span className="text-sm text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Your perspective:
                </span>
                <p className="text-lg font-semibold text-[#C83B50]" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>
                  {objectName}
                </p>
              </div>
              <h3 className="text-2xl font-bold text-[#F5F0EB] mb-2" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase' }}>
                {activity.commentQuestion}
              </h3>
              <textarea
                value={comment}
                onChange={(e) => setComment(commentMaxLength ? e.target.value.slice(0, commentMaxLength) : e.target.value)}
                className="w-full px-4 py-3 bg-[#1A1714] border border-[rgba(215,205,195,0.12)] text-[#F5F0EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C83B50] min-h-[150px] resize-none"
                style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}
                placeholder="Share your thoughts..."
                maxLength={commentMaxLength}
                autoFocus
              />
              {commentMaxLength && (
                <p className="text-xs text-[#7A7068] text-right" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.55rem' }}>
                  {comment.length}/{commentMaxLength} characters
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[rgba(215,205,195,0.12)] p-4 flex items-center gap-3">
          {onDelete && (existingData?.rating || existingData?.comment) && (
            <button
              onClick={() => { if (window.confirm('Delete this entry?')) onDelete!(); }}
              className="text-[#4a4440] hover:text-[#7A7068] transition-colors mr-auto"
              style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em' }}
            >
              delete
            </button>
          )}
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
            {isLastStep ? 'Submit' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
