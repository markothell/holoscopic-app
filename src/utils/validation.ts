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
}