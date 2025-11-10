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

          {/* Activity Info */}
          <div className="bg-slate-700 rounded-lg p-4 space-y-2">
            <p className="text-sm text-gray-300">
              <span className="font-semibold">Entries:</span> {activity.maxEntries || 1}
            </p>
            <p className="text-sm text-gray-300">
              <span className="font-semibold">X-Axis:</span> {activity.xAxis.label}
            </p>
            <p className="text-sm text-gray-300">
              <span className="font-semibold">Y-Axis:</span> {activity.yAxis.label}
            </p>
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
