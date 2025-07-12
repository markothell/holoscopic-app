'use client';

import { useState, useEffect } from 'react';

interface ConnectionStatusProps {
  isConnected: boolean;
  participantCount: number;
  isReconnecting?: boolean;
}

export default function ConnectionStatus({ 
  isConnected, 
  participantCount, 
  isReconnecting = false 
}: ConnectionStatusProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="flex items-center gap-2">
        {/* Connection Indicator */}
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all cursor-pointer ${
            isConnected
              ? 'bg-green-100 text-green-800 hover:bg-green-200'
              : 'bg-red-100 text-red-800 hover:bg-red-200'
          }`}
          onClick={() => setShowDetails(!showDetails)}
        >
          {/* Status Dot */}
          <div className="relative">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            {isReconnecting && (
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            )}
          </div>

          {/* Status Text */}
          <span>
            {isReconnecting
              ? 'Reconnecting...'
              : isConnected
              ? 'Connected'
              : 'Disconnected'}
          </span>

          {/* Participant Count */}
          {isConnected && (
            <span className="bg-white bg-opacity-50 px-2 py-1 rounded-full text-xs">
              {participantCount}
            </span>
          )}
        </div>

        {/* Details Dropdown */}
        {showDetails && (
          <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[200px]">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
                  {isReconnecting
                    ? 'Reconnecting'
                    : isConnected
                    ? 'Connected'
                    : 'Disconnected'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Participants:</span>
                <span className="text-gray-800">{participantCount}</span>
              </div>
              {!isConnected && (
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    Your responses are saved locally and will sync when connection is restored.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Overlay for closing details */}
      {showDetails && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowDetails(false)}
        />
      )}
    </div>
  );
}