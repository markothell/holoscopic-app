'use client';

import { useEffect, useState } from 'react';

interface PauseOverlayProps {
  isVisible: boolean;
  onResume: () => void;
  screenName: string;
  autoResumeSeconds?: number;
}

export default function PauseOverlay({ 
  isVisible, 
  onResume, 
  screenName, 
  autoResumeSeconds = 5 
}: PauseOverlayProps) {
  const [countdown, setCountdown] = useState(autoResumeSeconds);

  useEffect(() => {
    if (!isVisible) return;

    setCountdown(autoResumeSeconds);
    
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          onResume();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isVisible, autoResumeSeconds, onResume]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 sm:p-8 max-w-md w-full text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.01M15 10h1.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Take a Moment</h2>
          <p className="text-gray-600">
            Ready to continue to {screenName}?
          </p>
        </div>

        <div className="mb-6">
          <div className="text-4xl font-bold text-blue-600 mb-2">{countdown}</div>
          <p className="text-sm text-gray-500">
            Auto-continuing in {countdown} second{countdown !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onResume}
            className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            Continue Now
          </button>
          <button
            onClick={() => setCountdown(autoResumeSeconds)}
            className="flex-1 bg-gray-200 text-gray-800 py-3 px-6 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
          >
            Reset Timer
          </button>
        </div>
      </div>
    </div>
  );
}