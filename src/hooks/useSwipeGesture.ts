'use client';

import { useEffect, useRef, useState } from 'react';

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  minDistance?: number;
  maxTime?: number;
}

export function useSwipeGesture(options: SwipeGestureOptions) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    minDistance = 50,
    maxTime = 300
  } = options;

  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as Element;
      // Allow normal touch behavior for form elements and elements with touch-auto class
      // But be more specific - only block if actually interacting with the form element
      if (target.matches('textarea, input, select') || target.closest('button[type="submit"]')) {
        return;
      }
      
      const touch = e.touches[0];
      setTouchStart({
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      });
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStart) return;

      const target = e.target as Element;
      // Allow normal touch behavior for form elements - but be more specific
      if (target.matches('textarea, input, select') || target.closest('button[type="submit"]')) {
        setTouchStart(null);
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStart.x;
      const deltaY = touch.clientY - touchStart.y;
      const deltaTime = Date.now() - touchStart.time;

      // Check if swipe is within time limit
      if (deltaTime > maxTime) {
        setTouchStart(null);
        return;
      }

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Check if swipe distance is sufficient
      if (absX < minDistance && absY < minDistance) {
        setTouchStart(null);
        return;
      }

      // Determine swipe direction
      if (absX > absY) {
        // Horizontal swipe
        if (deltaX > 0) {
          onSwipeRight?.();
        } else {
          onSwipeLeft?.();
        }
      } else {
        // Vertical swipe
        if (deltaY > 0) {
          onSwipeDown?.();
        } else {
          onSwipeUp?.();
        }
      }

      setTouchStart(null);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const target = e.target as Element;
      // Allow normal scrolling for form elements - but be more specific
      if (!touchStart || target.matches('textarea, input, select')) {
        return;
      }
      
      // Prevent default scrolling behavior during swipe
      e.preventDefault();
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchmove', handleTouchMove);
    };
  }, [touchStart, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, minDistance, maxTime]);

  return elementRef;
}