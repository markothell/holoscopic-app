// Validation utilities for forms and data

import { ActivityFormData } from '@/models/Activity';
import { UrlUtils } from './urlUtils';

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export class ValidationService {
  // Validate activity form data
  static validateActivityForm(data: ActivityFormData): ValidationResult {
    const errors: Record<string, string> = {};

    // Title validation
    if (!data.title || data.title.trim().length === 0) {
      errors.title = 'Title is required';
    } else if (data.title.trim().length > 100) {
      errors.title = 'Title must be less than 100 characters';
    }

    // URL name validation (optional)
    if (data.urlName && data.urlName.trim().length > 0) {
      if (!UrlUtils.isValidActivityName(data.urlName)) {
        errors.urlName = 'URL name must be 1-50 characters, letters, numbers, and hyphens only';
      } else if (UrlUtils.hasRouteConflict(UrlUtils.cleanActivityName(data.urlName))) {
        errors.urlName = 'URL name conflicts with system routes';
      }
    }

    // Map question validation
    if (!data.mapQuestion || data.mapQuestion.trim().length === 0) {
      errors.mapQuestion = 'Map question is required';
    } else if (data.mapQuestion.trim().length > 200) {
      errors.mapQuestion = 'Map question must be less than 200 characters';
    }

    // Map question 2 validation (optional for backward compatibility)
    if (data.mapQuestion2 && data.mapQuestion2.trim().length > 200) {
      errors.mapQuestion2 = 'Map question 2 must be less than 200 characters';
    }

    // X-axis validation
    if (!data.xAxisLabel || data.xAxisLabel.trim().length === 0) {
      errors.xAxisLabel = 'X-axis label is required';
    } else if (data.xAxisLabel.trim().length > 50) {
      errors.xAxisLabel = 'X-axis label must be less than 50 characters';
    }

    if (!data.xAxisMin || data.xAxisMin.trim().length === 0) {
      errors.xAxisMin = 'X-axis minimum label is required';
    } else if (data.xAxisMin.trim().length > 30) {
      errors.xAxisMin = 'X-axis minimum label must be less than 30 characters';
    }

    if (!data.xAxisMax || data.xAxisMax.trim().length === 0) {
      errors.xAxisMax = 'X-axis maximum label is required';
    } else if (data.xAxisMax.trim().length > 30) {
      errors.xAxisMax = 'X-axis maximum label must be less than 30 characters';
    }

    // Y-axis validation
    if (!data.yAxisLabel || data.yAxisLabel.trim().length === 0) {
      errors.yAxisLabel = 'Y-axis label is required';
    } else if (data.yAxisLabel.trim().length > 50) {
      errors.yAxisLabel = 'Y-axis label must be less than 50 characters';
    }

    if (!data.yAxisMin || data.yAxisMin.trim().length === 0) {
      errors.yAxisMin = 'Y-axis minimum label is required';
    } else if (data.yAxisMin.trim().length > 30) {
      errors.yAxisMin = 'Y-axis minimum label must be less than 30 characters';
    }

    if (!data.yAxisMax || data.yAxisMax.trim().length === 0) {
      errors.yAxisMax = 'Y-axis maximum label is required';
    } else if (data.yAxisMax.trim().length > 30) {
      errors.yAxisMax = 'Y-axis maximum label must be less than 30 characters';
    }

    // Comment question validation
    if (!data.commentQuestion || data.commentQuestion.trim().length === 0) {
      errors.commentQuestion = 'Comment question is required';
    } else if (data.commentQuestion.trim().length > 200) {
      errors.commentQuestion = 'Comment question must be less than 200 characters';
    }

    // Object name question validation
    if (!data.objectNameQuestion || data.objectNameQuestion.trim().length === 0) {
      errors.objectNameQuestion = 'Object name question is required';
    } else if (data.objectNameQuestion.trim().length > 200) {
      errors.objectNameQuestion = 'Object name question must be less than 200 characters';
    }

    // Starter data validation (optional)
    if (data.starterData && data.starterData.trim().length > 0) {
      try {
        const parsed = JSON.parse(data.starterData);
        if (!Array.isArray(parsed)) {
          errors.starterData = 'Starter data must be a JSON array';
        } else {
          // Validate each item in the array
          for (let i = 0; i < parsed.length; i++) {
            const item = parsed[i];
            if (typeof item !== 'object' || item === null) {
              errors.starterData = `Item ${i + 1} must be an object`;
              break;
            }
            if (typeof item.x !== 'number' || item.x < 0 || item.x > 1) {
              errors.starterData = `Item ${i + 1}: x must be a number between 0 and 1`;
              break;
            }
            if (typeof item.y !== 'number' || item.y < 0 || item.y > 1) {
              errors.starterData = `Item ${i + 1}: y must be a number between 0 and 1`;
              break;
            }
            if (!item.objectName || typeof item.objectName !== 'string' || item.objectName.length > 25) {
              errors.starterData = `Item ${i + 1}: objectName must be a string (max 25 characters)`;
              break;
            }
            if (!item.comment || typeof item.comment !== 'string') {
              errors.starterData = `Item ${i + 1}: comment must be a string`;
              break;
            }
          }
        }
      } catch (e) {
        errors.starterData = 'Invalid JSON format';
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // Validate comment text
  static validateComment(text: string): ValidationResult {
    const errors: Record<string, string> = {};

    if (!text || text.trim().length === 0) {
      errors.text = 'Comment cannot be empty';
    } else if (text.trim().length > 500) {
      errors.text = 'Comment must be less than 500 characters';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // Validate rating position
  static validateRatingPosition(position: { x: number; y: number }): ValidationResult {
    const errors: Record<string, string> = {};

    if (typeof position.x !== 'number' || position.x < 0 || position.x > 1) {
      errors.x = 'X position must be between 0 and 1';
    }

    if (typeof position.y !== 'number' || position.y < 0 || position.y > 1) {
      errors.y = 'Y position must be between 0 and 1';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // Validate username
  static validateUsername(username: string): ValidationResult {
    const errors: Record<string, string> = {};

    if (!username || username.trim().length === 0) {
      errors.username = 'Username is required';
    } else if (username.trim().length < 2) {
      errors.username = 'Username must be at least 2 characters';
    } else if (username.trim().length > 20) {
      errors.username = 'Username must be less than 20 characters';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(username.trim())) {
      errors.username = 'Username can only contain letters, numbers, hyphens, and underscores';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // Sanitize text input
  static sanitizeText(text: string): string {
    return text.trim().replace(/[<>]/g, '');
  }

  // Generate random username
  static generateRandomUsername(): string {
    const adjectives = ['Quick', 'Bright', 'Clever', 'Swift', 'Bold', 'Wise', 'Kind', 'Brave'];
    const nouns = ['Fox', 'Eagle', 'Lion', 'Tiger', 'Bear', 'Wolf', 'Hawk', 'Owl'];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 100);
    return `${adjective}${noun}${number}`;
  }

  // Determine which quadrant a position falls into
  static getQuadrant(position: { x: number; y: number }): 'q1' | 'q2' | 'q3' | 'q4' {
    const isRightHalf = position.x >= 0.5;
    const isTopHalf = position.y >= 0.5; // High Y values are top half (flipped axis)

    if (isRightHalf && isTopHalf) return 'q1'; // Top-right (++)
    if (!isRightHalf && isTopHalf) return 'q2'; // Top-left (-+)
    if (!isRightHalf && !isTopHalf) return 'q3'; // Bottom-left (--)
    return 'q4'; // Bottom-right (+-)
  }

  // Get quadrant color
  static getQuadrantColor(quadrant: 'q1' | 'q2' | 'q3' | 'q4'): string {
    const colors = {
      q1: '#3b82f6', // Blue
      q2: '#10b981', // Green  
      q3: '#ef4444', // Red
      q4: '#f59e0b', // Yellow
    };
    return colors[quadrant];
  }

  // Get quadrant color class
  static getQuadrantColorClass(quadrant: 'q1' | 'q2' | 'q3' | 'q4'): string {
    const colorClasses = {
      q1: 'bg-blue-500',
      q2: 'bg-green-500',
      q3: 'bg-red-500',
      q4: 'bg-yellow-500',
    };
    return colorClasses[quadrant];
  }
}