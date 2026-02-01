'use client';

import { useState, useEffect } from 'react';
import { HoloscopicActivity, Rating } from '@/models/Activity';

interface SliderQuestionsProps {
  activity: HoloscopicActivity;
  onRatingSubmit: (position: { x: number; y: number }) => void;
  userRating?: Rating;
  showOnlyX?: boolean;
  showOnlyY?: boolean;
  stepLabel?: string;
}

export default function SliderQuestions({ 
  activity, 
  onRatingSubmit, 
  userRating,
  showOnlyX = false,
  showOnlyY = false,
  stepLabel
}: SliderQuestionsProps) {
  // State for slider values (0-1 normalized)
  const [xValue, setXValue] = useState<number>(userRating?.position.x ?? 0.5);
  const [yValue, setYValue] = useState<number>(userRating?.position.y ?? 0.5);

  // Update state when userRating changes
  useEffect(() => {
    if (userRating) {
      setXValue(userRating.position.x);
      setYValue(userRating.position.y);
    } else {
      // Reset to center when userRating is null (e.g., after clearing slot)
      setXValue(0.5);
      setYValue(0.5);
    }
  }, [userRating]);

  // Handle slider changes - only update local state during drag
  const handleXChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newX = parseFloat(event.target.value);
    setXValue(newX);
  };

  const handleYChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newY = parseFloat(event.target.value);
    setYValue(newY);
  };

  // Submit when slider is released
  const handleXRelease = () => {
    onRatingSubmit({ x: xValue, y: yValue });
  };

  const handleYRelease = () => {
    onRatingSubmit({ x: xValue, y: yValue });
  };

  return (
    <div className="w-full max-w-2xl">
      {stepLabel && (
        <div className="max-w-3xl mx-auto px-4">
          <p className="text-base sm:text-lg text-gray-300 mb-2 text-left">{stepLabel}</p>
        </div>
      )}
      <div className="space-y-12 max-w-3xl mx-auto px-4">
        
        {/* First Question (X-axis) */}
        {!showOnlyY && (
          <div className="space-y-6">
            <h3 className="text-white text-4xl sm:text-6xl font-bold text-left leading-tight">
              {activity.mapQuestion}
            </h3>
            
            <div className="space-y-2">
              {/* Slider with pill background */}
              <div className="bg-[#111827] p-6 rounded-2xl border border-white/10">
                <div className="relative">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={xValue}
                    onChange={handleXChange}
                    onMouseUp={handleXRelease}
                    onTouchEnd={handleXRelease}
                    inputMode="none"
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                  />
                  {/* Center tick mark */}
                  <div
                    className="absolute w-0.5 h-6 bg-white/30 pointer-events-none"
                    style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                  />
                </div>

                {/* Labels */}
                <div className="flex justify-between text-lg font-semibold text-gray-200 mt-4">
                  <span>{activity.xAxis.min}</span>
                  <span>{activity.xAxis.max}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Second Question (Y-axis) */}
        {!showOnlyX && (
          <div className="space-y-6">
            <h3 className="text-white text-4xl sm:text-6xl font-bold text-left leading-tight">
              {activity.mapQuestion2 || activity.mapQuestion}
            </h3>
            
            <div className="space-y-2">
              {/* Slider with pill background */}
              <div className="bg-[#111827] p-6 rounded-2xl border border-white/10">
                <div className="relative">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={yValue}
                    onChange={handleYChange}
                    onMouseUp={handleYRelease}
                    onTouchEnd={handleYRelease}
                    inputMode="none"
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                  />
                  {/* Center tick mark */}
                  <div
                    className="absolute w-0.5 h-6 bg-white/30 pointer-events-none"
                    style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                  />
                </div>

                {/* Labels */}
                <div className="flex justify-between text-lg font-semibold text-gray-200 mt-4">
                  <span>{activity.yAxis.min}</span>
                  <span>{activity.yAxis.max}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #0ea5e9;
          border: 2px solid white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #0ea5e9;
          border: 2px solid white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider:focus {
          outline: none;
        }

        .slider:focus::-webkit-slider-thumb {
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.3);
        }
      `}</style>
    </div>
  );
}