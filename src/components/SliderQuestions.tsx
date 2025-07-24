'use client';

import { useState, useEffect } from 'react';
import { WeAllExplainActivity, Rating } from '@/models/Activity';

interface SliderQuestionsProps {
  activity: WeAllExplainActivity;
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
  const [yValue, setYValue] = useState<number>(userRating ? (1 - userRating.position.y) : 0.5);

  // Update state when userRating changes
  useEffect(() => {
    if (userRating) {
      setXValue(userRating.position.x);
      setYValue(1 - userRating.position.y);
    }
  }, [userRating]);

  // Handle slider changes and submit immediately
  const handleXChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newX = parseFloat(event.target.value);
    setXValue(newX);
    onRatingSubmit({ x: newX, y: 1 - yValue });
  };

  const handleYChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newY = parseFloat(event.target.value);
    setYValue(newY);
    onRatingSubmit({ x: xValue, y: 1 - newY });
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
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-400">
                <div className="relative">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={xValue}
                    onChange={handleXChange}
                    className="w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer slider"
                  />
                  {/* Center tick mark */}
                  <div 
                    className="absolute w-0.5 h-6 bg-slate-300 pointer-events-none"
                    style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                  />
                </div>
                
                {/* Labels */}
                <div className="flex justify-between text-lg font-semibold text-slate-100 mt-4">
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
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-400">
                <div className="relative">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={yValue}
                    onChange={handleYChange}
                    className="w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer slider"
                  />
                  {/* Center tick mark */}
                  <div 
                    className="absolute w-0.5 h-6 bg-slate-300 pointer-events-none"
                    style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                  />
                </div>
                
                {/* Labels */}
                <div className="flex justify-between text-lg font-semibold text-slate-100 mt-4">
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
          background: #3b82f6;
          border: 2px solid white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          border: 2px solid white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider:focus {
          outline: none;
        }

        .slider:focus::-webkit-slider-thumb {
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
        }
      `}</style>
    </div>
  );
}