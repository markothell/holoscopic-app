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
      <div className="bg-slate-800 rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6">
          <div className="flex justify-between items-start mb-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              {activity.title}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-3xl leading-none ml-4"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {activity.author && (
            <p className="text-sm text-gray-400">
              Proposed by: {activity.author.name}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {activity.preamble && (
            <p className="text-gray-300 text-base leading-relaxed whitespace-pre-wrap">
              {activity.preamble}
            </p>
          )}

          {activity.wikiLink && (
            <div>
              <a
                href={activity.wikiLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline text-sm"
              >
                Source and discussion on wiki →
              </a>
            </div>
          )}

          {/* Visual Summary Section */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-start">
            {/* Entries Box */}
            <div className="bg-slate-700 rounded-lg p-6 backdrop-blur-sm w-full sm:w-[220px]">
              <h3 className="text-lg font-semibold mb-2 text-center text-white">
                {activity.maxEntries || 1} {activity.maxEntries === 1 ? 'Entry' : 'Entries'}
              </h3>
              <p className="text-sm text-gray-300 text-center">
                You can submit {activity.maxEntries || 1} response{activity.maxEntries !== 1 ? 's' : ''} for this activity
              </p>
            </div>

            {/* Map Axes Visual */}
            <div className="bg-slate-700 rounded-lg p-6 backdrop-blur-sm w-full sm:w-[220px]">
              <h3 className="text-lg font-semibold mb-4 text-center text-white">Map Axes</h3>
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
                  <span className="text-white/90 text-xs font-semibold bg-slate-800 bg-opacity-95 px-2 py-1 rounded shadow-sm">
                    {activity.xAxis.label}
                  </span>
                </div>

                {/* Y-axis label */}
                <div
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 -rotate-90"
                  style={{ left: '50%', top: '25%', transformOrigin: 'center' }}
                >
                  <span className="text-white/90 text-xs font-semibold bg-slate-800 bg-opacity-95 px-2 py-1 rounded whitespace-nowrap shadow-sm">
                    {activity.yAxis.label}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {activity.status === 'completed' && (
            <div className="bg-yellow-900 border border-yellow-700 rounded-lg px-4 py-3">
              <p className="text-yellow-200 text-center text-sm">
                This activity is closed. You can view the completed map.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 p-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
          >
            View Map
          </button>
          {activity.status !== 'completed' && (
            <button
              onClick={onBegin}
              className="flex-1 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
            >
              Begin
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
