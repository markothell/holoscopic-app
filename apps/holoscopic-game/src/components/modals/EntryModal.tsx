'use client';

import { useState, useEffect } from 'react';
import { HoloscopicActivity, Rating, Comment, SnapshotAnswer, SnapshotQuestion } from '@/models/Activity';
import { normalizeActivityType, REGISTRY } from '@hs/activities';

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

const monoLabel: React.CSSProperties = {
  fontFamily: 'var(--font-dm-mono), monospace', fontSize: 'var(--text-2xs)',
  letterSpacing: '0.08em', color: 'var(--text-muted)',
};

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

  const fieldCss: React.CSSProperties = {
    background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
    color: 'var(--text-primary)', fontFamily: 'var(--font-cormorant), Georgia, serif',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,13,11,0.35)' }}>
      <div className="rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)' }}>
        {/* Header with Progress */}
        <div className="p-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-base font-semibold flex items-center gap-2" style={{ ...monoLabel, fontSize: 'var(--text-xs)', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
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
              className="text-2xl leading-none transition-colors"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Close"
            >
              &times;
            </button>
          </div>
          <div className="w-full rounded-full h-1.5" style={{ background: 'var(--bg-tertiary)' }}>
            <div
              className="h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%`, background: 'var(--accent)' }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Object Name (non-snapshot types only; snapshot uses question labels as names) */}
          {step === 1 && !isSnapshotType && (
            <div className="space-y-4">
              <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', color: 'var(--text-primary)' }}>
                {activity.objectNameQuestion || 'Name something that represents your perspective'}
              </h3>
              <p className="mb-4" style={monoLabel}>
                Choose a name that will appear with your responses (max 25 characters)
              </p>
              <input
                type="text"
                value={objectName}
                onChange={(e) => setObjectName(e.target.value.slice(0, 25))}
                className="w-full px-4 py-3 rounded-lg focus:outline-none text-lg"
                style={fieldCss}
                placeholder="Enter name..."
                maxLength={25}
                autoFocus
              />
              <p className="text-right" style={{ ...monoLabel, fontSize: '0.6rem' }}>
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
                <span style={{ ...monoLabel, textTransform: 'uppercase' }}>
                  Your perspective:
                </span>
                <p className="text-lg font-semibold" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', color: 'var(--accent)' }}>
                  {objectName}
                </p>
              </div>
              <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', color: 'var(--text-primary)' }}>
                {activity.commentQuestion}
              </h3>
              <textarea
                value={comment}
                onChange={(e) => setComment(commentMaxLength ? e.target.value.slice(0, commentMaxLength) : e.target.value)}
                className="w-full px-4 py-3 rounded-lg focus:outline-none min-h-[150px] resize-none"
                style={fieldCss}
                placeholder="Share your thoughts..."
                maxLength={commentMaxLength}
                autoFocus
              />
              {commentMaxLength && (
                <p className="text-right" style={{ ...monoLabel, fontSize: '0.6rem' }}>
                  {comment.length}/{commentMaxLength} characters
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 flex items-center gap-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {onDelete && (existingData?.rating || existingData?.comment) && (
            <button
              onClick={() => { if (window.confirm('Delete this entry?')) onDelete!(); }}
              className="transition-colors mr-auto"
              style={{ ...monoLabel, fontSize: '0.6rem' }}
            >
              delete
            </button>
          )}
          <button
            onClick={handlePrevious}
            disabled={step === 1}
            className="px-6 py-3 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: 'var(--text-2xs)', letterSpacing: '0.12em', textTransform: 'uppercase', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            className="flex-1 px-6 py-3 font-medium rounded-lg transition-colors"
            style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: 'var(--text-2xs)', letterSpacing: '0.12em', textTransform: 'uppercase', background: 'var(--accent)', color: '#FFFFFF', border: 'none' }}
          >
            {isLastStep ? 'Submit' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
