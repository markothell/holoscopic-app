'use client';

import { useState, useEffect } from 'react';
import { WeAllExplainActivity, Rating } from '@/models/Activity';

interface SliderQuestionsProps {
  activity: WeAllExplainActivity;
  onRatingSubmit: (position: { x: number; y: number }) => void;
  userRating?: Rating;
}

export default function SliderQuestions({ 
  activity, 
  onRatingSubmit, 
  userRating 
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
    <div className="space-y-12 max-w-3xl mx-auto px-4">
      
      {/* First Question (X-axis) */}
      <div className="space-y-6">
        <h3 className="text-white text-4xl sm:text-6xl font-bold text-left leading-tight">
          {activity.mapQuestion}
        </h3>
        
        <div className="space-y-2">
          {/* Slider */}
          <div className="relative">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={xValue}
              onChange={handleXChange}
              className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider"
            />
            {/* Center tick mark */}
            <div 
              className="absolute top-0 w-0.5 h-2 bg-slate-300 pointer-events-none"
              style={{ left: '50%', transform: 'translateX(-50%)' }}
            />
          </div>
          
          {/* Labels */}
          <div className="flex justify-between text-lg font-semibold text-slate-300">
            <span>{activity.xAxis.min}</span>
            <span>{activity.xAxis.max}</span>
          </div>
        </div>
      </div>

      {/* Second Question (Y-axis) */}
      <div className="space-y-6">
        <h3 className="text-white text-4xl sm:text-6xl font-bold text-left leading-tight">
          {activity.mapQuestion2 || activity.mapQuestion}
        </h3>
        
        <div className="space-y-2">
          {/* Slider */}
          <div className="relative">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={yValue}
              onChange={handleYChange}
              className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider"
            />
            {/* Center tick mark */}
            <div 
              className="absolute top-0 w-0.5 h-2 bg-slate-300 pointer-events-none"
              style={{ left: '50%', transform: 'translateX(-50%)' }}
            />
          </div>
          
          {/* Labels */}
          <div className="flex justify-between text-lg font-semibold text-slate-300">
            <span>{activity.yAxis.min}</span>
            <span>{activity.yAxis.max}</span>
          </div>
        </div>
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