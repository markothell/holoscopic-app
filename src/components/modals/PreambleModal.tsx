'use client';

import { HoloscopicActivity } from '@/models/Activity';

interface PreambleModalProps {
  activity: HoloscopicActivity;
  isOpen: boolean;
  onClose: () => void;
  onBegin: () => void;
}

export default function PreambleModal({ activity, isOpen, onClose, onBegin }: PreambleModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[#252120] border border-[rgba(215,205,195,0.12)] rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#252120] border-b border-[rgba(215,205,195,0.12)] p-6">
          <div className="flex justify-between items-start mb-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#F5F0EB]" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
              {activity.title}
            </h2>
            <button
              onClick={onClose}
              className="text-[#7A7068] hover:text-[#F5F0EB] text-3xl leading-none ml-4 transition-colors"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
          {activity.author && (
            <p className="text-sm text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', fontWeight: 300, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Proposed by: {activity.author.name}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {activity.preamble && (
            <p className="text-[#A89F96] text-base leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>
              {activity.preamble}
            </p>
          )}

          {activity.wikiLink && (
            <div>
              <a
                href={activity.wikiLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#C83B50] hover:text-[#e04d63] underline text-sm transition-colors"
                style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.65rem', fontWeight: 300, letterSpacing: '0.1em' }}
              >
                Source and discussion on wiki &rarr;
              </a>
            </div>
          )}

          {/* Visual Summary Section */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-start">
            {/* Entries Box */}
            <div className="bg-[#1A1714] border border-[rgba(215,205,195,0.12)] rounded-lg p-6 w-full sm:w-[220px]">
              <h3 className="text-lg font-semibold mb-2 text-center text-[#F5F0EB]" style={{ fontFamily: 'var(--font-barlow), sans-serif' }}>
                {activity.maxEntries || 1} {activity.maxEntries === 1 ? 'Entry' : 'Entries'}
              </h3>
              <p className="text-sm text-[#7A7068] text-center" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', fontWeight: 300 }}>
                You can submit {activity.maxEntries || 1} response{activity.maxEntries !== 1 ? 's' : ''} for this activity
              </p>
            </div>

            {/* Map Axes Visual */}
            <div className="bg-[#1A1714] border border-[rgba(215,205,195,0.12)] rounded-lg p-6 w-full sm:w-[220px]">
              <h3 className="text-lg font-semibold mb-4 text-center text-[#F5F0EB]" style={{ fontFamily: 'var(--font-barlow), sans-serif' }}>Map Axes</h3>
              <div className="relative w-[160px] h-[160px] mx-auto">
                {/* Professional Axes using arrowAx.svg */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <img
                    src="/arrowAx.svg"
                    alt="Axis arrows"
                    className="w-full h-full opacity-90"
                    style={{ filter: 'brightness(1.1)' }}
                  />
                </div>

                {/* X-axis label */}
                <div className="absolute transform -translate-y-1/2" style={{ top: '50%', left: '55%' }}>
                  <span className="text-[#F5F0EB]/90 text-xs font-semibold bg-[#252120] px-2 py-1 rounded shadow-sm">
                    {activity.xAxis.label}
                  </span>
                </div>

                {/* Y-axis label */}
                <div
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 -rotate-90"
                  style={{ left: '50%', top: '25%', transformOrigin: 'center' }}
                >
                  <span className="text-[#F5F0EB]/90 text-xs font-semibold bg-[#252120] px-2 py-1 rounded whitespace-nowrap shadow-sm">
                    {activity.yAxis.label}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {activity.status === 'completed' && (
            <div className="bg-[rgba(200,59,80,0.1)] border border-[rgba(200,59,80,0.2)] rounded-lg px-4 py-3">
              <p className="text-[#C83B50] text-center text-sm">
                This activity is closed. You can view the completed map.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[#252120] border-t border-[rgba(215,205,195,0.12)] p-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-[rgba(215,205,195,0.1)] hover:bg-[rgba(215,205,195,0.18)] text-[#F5F0EB] font-medium rounded-lg transition-colors"
            style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.7rem', fontWeight: 300, letterSpacing: '0.12em', textTransform: 'uppercase' }}
          >
            View Map
          </button>
          {activity.status !== 'completed' && (
            <button
              onClick={onBegin}
              className="flex-1 px-6 py-3 bg-[#C83B50] hover:bg-[#B03248] text-white font-medium rounded-lg transition-colors"
              style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.7rem', fontWeight: 300, letterSpacing: '0.12em', textTransform: 'uppercase' }}
            >
              Begin
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
