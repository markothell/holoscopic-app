'use client';

import { useState, useEffect } from 'react';
import { TypePositioningStepsProps } from '@/components/activities/registry-types';
import { SnapshotAnswer } from '@/models/Activity';
import AxisSelector from './AxisSelector';

// Convert axis point index to normalized 0-1 position
// For 2 points: 0→0.25, 1→0.75
// For 4 points: 0→0.125, 1→0.375, 2→0.625, 3→0.875
function indexToNorm(index: number, points: number): number {
  return (index + 0.5) / points;
}

// Convert normalized position back to nearest axis index
function normToIndex(norm: number, points: number): number {
  return Math.min(points - 1, Math.max(0, Math.round(norm * points - 0.5)));
}

// For each question, 4 phases: name (0), x (1), y (2), comment (3)
// phaseIndex = step - 1
// questionIndex = floor(phaseIndex / 4)
// phase = phaseIndex % 4

export default function SnapshotPositioningSteps({
  activity,
  step,
  onXChange,
  onYChange,
  onSnapshotAnswersChange,
  snapshotQuestionId,
  existingRating,
  existingComment,
}: TypePositioningStepsProps) {
  const allQuestions = [...(activity.snapshotQuestions || [])].sort((a, b) => a.order - b.order);
  // Single-question mode: filter to just the target question
  const questions = snapshotQuestionId
    ? allQuestions.filter(q => q.id === snapshotQuestionId)
    : allQuestions;
  const xPoints = activity.xAxisPoints || 2;
  const yPoints = activity.yAxisPoints || 2;
  const xLabels = activity.xAxisLabels || [];
  const yLabels = activity.yAxisLabels || [];

  const phaseIndex = step - 1;
  const questionIndex = Math.floor(phaseIndex / 4);
  const phase = phaseIndex % 4; // 0=name, 1=x, 2=y, 3=comment
  const currentQuestion = questions[questionIndex];

  // In single-question mode, existingRating/existingComment belong to questions[0]
  const [objectNames, setObjectNames] = useState<string[]>(() =>
    questions.map((_, i) => (i === 0 && existingRating?.objectName) ? existingRating.objectName : '')
  );
  const [xSelections, setXSelections] = useState<(number | null)[]>(() =>
    questions.map((_, i) =>
      (i === 0 && existingRating?.position?.x != null)
        ? normToIndex(existingRating.position.x, xPoints)
        : null
    )
  );
  const [ySelections, setYSelections] = useState<(number | null)[]>(() =>
    questions.map((_, i) =>
      (i === 0 && existingRating?.position?.y != null)
        ? normToIndex(existingRating.position.y, yPoints)
        : null
    )
  );
  const [comments, setComments] = useState<string[]>(() =>
    questions.map((_, i) => (i === 0 && existingComment?.text) ? existingComment.text : '')
  );

  // Re-populate state when the target question changes (different modal open)
  useEffect(() => {
    setObjectNames(questions.map((_, i) =>
      (i === 0 && existingRating?.objectName) ? existingRating.objectName : ''
    ));
    setXSelections(questions.map((_, i) =>
      (i === 0 && existingRating?.position?.x != null)
        ? normToIndex(existingRating.position.x, xPoints)
        : null
    ));
    setYSelections(questions.map((_, i) =>
      (i === 0 && existingRating?.position?.y != null)
        ? normToIndex(existingRating.position.y, yPoints)
        : null
    ));
    setComments(questions.map((_, i) =>
      (i === 0 && existingComment?.text) ? existingComment.text : ''
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotQuestionId]);

  // Keep EntryModal's x/y in sync with current question's selection
  useEffect(() => {
    if (xSelections[questionIndex] != null) {
      onXChange(indexToNorm(xSelections[questionIndex]!, xPoints));
    }
    if (ySelections[questionIndex] != null) {
      onYChange(indexToNorm(ySelections[questionIndex]!, yPoints));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xSelections, ySelections, questionIndex]);

  // Bubble all answers up whenever they change
  useEffect(() => {
    if (!onSnapshotAnswersChange) return;
    const answers: SnapshotAnswer[] = questions.map((q, i) => ({
      questionId: q.id,
      objectName: objectNames[i] || '',
      position: {
        x: xSelections[i] != null ? indexToNorm(xSelections[i]!, xPoints) : 0.5,
        y: ySelections[i] != null ? indexToNorm(ySelections[i]!, yPoints) : 0.5,
      },
      comment: comments[i] || '',
    }));
    onSnapshotAnswersChange(answers);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectNames, xSelections, ySelections, comments]);

  if (!currentQuestion) {
    return (
      <div className="flex items-center justify-center h-32">
        <p style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '1rem', color: '#7A7068', textAlign: 'center' }}>
          This activity has no questions configured. Edit it in the create panel to add questions.
        </p>
      </div>
    );
  }

  // Question header — shown on all 4 phases
  const questionHeader = (
    <div className="flex items-center gap-2 mb-1">
      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: currentQuestion.color, flexShrink: 0 }} />
      <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7A7068' }}>
        {currentQuestion.topic || currentQuestion.label}{questions.length > 1 ? ` \u2014 ${questionIndex + 1} of ${questions.length}` : ''}
      </span>
    </div>
  );

  // Name step (phase 0)
  if (phase === 0) {
    return (
      <div className="space-y-5">
        {questionHeader}
        <h3 className="text-2xl font-bold text-[#F5F0EB]" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase' }}>
          {currentQuestion.label || currentQuestion.topic}
        </h3>
        <input
          type="text"
          value={objectNames[questionIndex]}
          onChange={(e) => {
            const updated = [...objectNames];
            updated[questionIndex] = e.target.value.slice(0, 25);
            setObjectNames(updated);
          }}
          className="w-full px-4 py-3 bg-[#1A1714] border border-[rgba(215,205,195,0.12)] text-[#F5F0EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C83B50] text-lg"
          style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}
          placeholder="Enter name..."
          maxLength={25}
          autoFocus
        />
        <p className="text-right" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.55rem', color: '#7A7068' }}>
          {objectNames[questionIndex].length}/25 characters
        </p>
      </div>
    );
  }

  // X axis step (phase 1)
  if (phase === 1) {
    const opts = xLabels.length >= xPoints
      ? xLabels.slice(0, xPoints)
      : Array.from({ length: xPoints }, (_, i) => `Option ${i + 1}`);
    return (
      <div className="space-y-5">
        {questionHeader}
        <div className="mb-1">
          <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A7068' }}>
            Your perspective:
          </span>
          <p style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '1.1rem', fontWeight: 600, color: '#C83B50' }}>
            {objectNames[questionIndex] || '—'}
          </p>
        </div>
        <h3 className="text-2xl font-bold text-[#F5F0EB]" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase' }}>
          {activity.mapQuestion}
        </h3>
        <AxisSelector
          label={activity.xAxis?.label || 'Horizontal'}
          options={opts}
          value={xSelections[questionIndex]}
          onChange={(i) => {
            const updated = [...xSelections];
            updated[questionIndex] = i;
            setXSelections(updated);
          }}
          axisDirection="horizontal"
        />
      </div>
    );
  }

  // Y axis step (phase 2)
  if (phase === 2) {
    const opts = yLabels.length >= yPoints
      ? yLabels.slice(0, yPoints)
      : Array.from({ length: yPoints }, (_, i) => `Option ${i + 1}`);
    return (
      <div className="space-y-5">
        {questionHeader}
        <div className="mb-1">
          <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A7068' }}>
            Your perspective:
          </span>
          <p style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '1.1rem', fontWeight: 600, color: '#C83B50' }}>
            {objectNames[questionIndex] || '—'}
          </p>
        </div>
        <h3 className="text-2xl font-bold text-[#F5F0EB]" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase' }}>
          {activity.mapQuestion2 || activity.mapQuestion}
        </h3>
        <AxisSelector
          label={activity.yAxis?.label || 'Vertical'}
          options={opts}
          value={ySelections[questionIndex]}
          onChange={(i) => {
            const updated = [...ySelections];
            updated[questionIndex] = i;
            setYSelections(updated);
          }}
          axisDirection="horizontal"
        />
      </div>
    );
  }

  // Comment step (phase 3)
  return (
    <div className="space-y-5">
      {questionHeader}
      <div className="mb-1">
        <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A7068' }}>
          Your perspective:
        </span>
        <p style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '1.1rem', fontWeight: 600, color: '#C83B50' }}>
          {objectNames[questionIndex] || '—'}
        </p>
      </div>
      <h3 className="text-2xl font-bold text-[#F5F0EB]" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase' }}>
        {activity.commentQuestion}
      </h3>
      <textarea
        value={comments[questionIndex]}
        onChange={(e) => {
          const updated = [...comments];
          updated[questionIndex] = e.target.value.slice(0, 500);
          setComments(updated);
        }}
        className="w-full px-4 py-3 bg-[#1A1714] border border-[rgba(215,205,195,0.12)] text-[#F5F0EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C83B50] min-h-[120px] resize-none"
        style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}
        placeholder="Share your thoughts..."
        maxLength={500}
        autoFocus
      />
      <p className="text-right" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.55rem', color: '#7A7068' }}>
        {comments[questionIndex].length}/500
      </p>
    </div>
  );
}
