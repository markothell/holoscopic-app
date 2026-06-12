'use client';

import { HoloscopicActivity } from '@/models/Activity';
import { useInstance } from '@/contexts/InstanceContext';
import AxisPreview from '@/components/AxisPreview';
import { STR, HOLON_SYMBOL } from '@/lib/strings';

interface PreambleModalProps {
  activity: HoloscopicActivity;
  isOpen: boolean;
  onClose: () => void;
  onBegin: () => void;
  hasJoined: boolean;
}

export default function PreambleModal({ activity, isOpen, onClose, onBegin, hasJoined }: PreambleModalProps) {
  const { config } = useInstance();
  if (!isOpen) return null;

  const isSnapshot = activity.activityType === 'snapshot';
  const snapshotQuestions = isSnapshot
    ? [...(activity.snapshotQuestions || [])].sort((a, b) => a.order - b.order)
    : [];
  const entryCount = isSnapshot ? snapshotQuestions.length : (activity.maxEntries ?? 1);
  const stake = config?.holons?.activityStakeAmount ?? 5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,13,11,0.35)' }}>
      <div className="rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)' }}>
        {/* Header */}
        <div className="sticky top-0 p-6" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex justify-between items-start mb-2">
            <h2 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              {activity.title}
            </h2>
            <button
              onClick={onClose}
              className="text-3xl leading-none ml-4 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Close"
            >
              &times;
            </button>
          </div>
          {activity.author && (
            <p style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: 'var(--text-2xs)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Proposed by: {activity.author.name}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {activity.preamble && (
            <p className="text-base leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', color: 'var(--text-secondary)' }}>
              {activity.preamble}
            </p>
          )}

          {activity.wikiLink && (
            <div>
              <a
                href={activity.wikiLink}
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition-colors"
                style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: 'var(--text-2xs)', letterSpacing: '0.1em', color: 'var(--accent)' }}
              >
                Reference &rarr;
              </a>
            </div>
          )}

          {/* Visual Summary Section */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-start">
            {/* Entries Box */}
            <div className="rounded-lg p-6 w-full sm:w-[220px]" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
              <h3 className="text-lg font-semibold mb-2 text-center" style={{ color: 'var(--text-primary)' }}>
                {activity.maxEntries === 0 ? 'Unlimited' : `${entryCount} ${entryCount === 1 ? 'Entry' : 'Entries'}`}
              </h3>
              <p className="text-center" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                {activity.maxEntries === 0
                  ? 'This activity supports unlimited entries'
                  : isSnapshot
                    ? `Map your perspective across ${entryCount} question${entryCount !== 1 ? 's' : ''}`
                    : `You can submit ${entryCount} response${entryCount !== 1 ? 's' : ''} for this activity`}
              </p>
            </div>

            {/* Snapshot: question list; others: map axes visual */}
            {isSnapshot ? (
              <div className="rounded-lg p-6 w-full sm:flex-1" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Questions</h3>
                <div className="flex flex-col gap-2">
                  {snapshotQuestions.map(q => (
                    <div key={q.id} className="flex items-center gap-2">
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: q.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                        {q.topic ? <><span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{q.topic}</span> — {q.label}</> : q.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg p-6 w-full sm:w-[220px] flex flex-col items-center" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
                <h3 className="text-lg font-semibold mb-4 text-center" style={{ color: 'var(--text-primary)' }}>{STR.map} Axes</h3>
                <AxisPreview
                  xLabel={activity.xAxis.label} xMin={activity.xAxis.min} xMax={activity.xAxis.max}
                  yLabel={activity.yAxis.label} yMin={activity.yAxis.min} yMax={activity.yAxis.max}
                  size={160}
                />
              </div>
            )}
          </div>

          {/* The stake — say what joining costs and where it goes */}
          {activity.status !== 'completed' && !hasJoined && activity.maxEntries !== 0 && (
            <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(200,59,80,0.05)', border: '1px solid rgba(200,59,80,0.18)' }}>
              <p style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Joining stakes {HOLON_SYMBOL}{stake} {STR.holons} into this {STR.map.toLowerCase()}&apos;s pool.
                You direct it by voting on others&apos; comments — whatever you don&apos;t direct returns to you when the {STR.map.toLowerCase()} closes.
              </p>
            </div>
          )}

          {activity.status === 'completed' && (
            <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(200,59,80,0.06)', border: '1px solid rgba(200,59,80,0.2)' }}>
              <p className="text-center text-sm" style={{ color: 'var(--accent)' }}>
                This {STR.map.toLowerCase()} has settled. You can view the completed map.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 p-6 flex gap-3" style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 font-medium rounded-lg transition-colors"
            style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: 'var(--text-2xs)', letterSpacing: '0.12em', textTransform: 'uppercase', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
          >
            View {STR.map}
          </button>
          {activity.status !== 'completed' && (
            <button
              onClick={onBegin}
              className="flex-1 px-6 py-3 font-medium rounded-lg transition-colors"
              style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: 'var(--text-2xs)', letterSpacing: '0.12em', textTransform: 'uppercase', background: 'var(--accent)', color: '#FFFFFF', border: 'none' }}
            >
              {hasJoined ? 'Add New Entry' : `Join · ${HOLON_SYMBOL}${stake} stake`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
