// Activity Type Registry
// Defines the available activity types and their configurations

import { ActivityType } from '@/models/Activity';

export interface ActivityTypeConfig {
  id: ActivityType;
  label: string;
  description: string;
  icon: string;

  // Screen flow configuration
  screens: string[];

  // Field requirements
  requiresMapQuestion2: boolean;  // Second question for Y-axis (holoscopic only)

  // Positioning method
  positioningMethod: 'sliders' | 'quadrant';
}

export const ACTIVITY_TYPES: Record<ActivityType, ActivityTypeConfig> = {
  holoscopic: {
    id: 'holoscopic',
    label: 'Holoscopic',
    description: 'Precise 2D positioning with dual sliders for X and Y axes. Best for nuanced perspective mapping where continuous positioning matters.',
    icon: '🎯',
    screens: ['intro', 'objectName', 'xSlider', 'ySlider', 'comment', 'results'],
    requiresMapQuestion2: true,
    positioningMethod: 'sliders',
  },
  findthecenter: {
    id: 'findthecenter',
    label: 'Find The Center',
    description: 'Simplified 4-quadrant selection for quick positioning. Best for rapid categorization and finding common ground.',
    icon: '⬛',
    screens: ['intro', 'objectName', 'quadrant', 'comment', 'results'],
    requiresMapQuestion2: false,
    positioningMethod: 'quadrant',
  },
} as const;

// Helper functions
export function getActivityTypeConfig(type: ActivityType): ActivityTypeConfig {
  return ACTIVITY_TYPES[type] || ACTIVITY_TYPES.holoscopic;
}

export function getActivityTypeLabel(type: ActivityType): string {
  return getActivityTypeConfig(type).label;
}

export function getActivityTypeIcon(type: ActivityType): string {
  return getActivityTypeConfig(type).icon;
}

export function getAllActivityTypes(): ActivityTypeConfig[] {
  return Object.values(ACTIVITY_TYPES);
}

// Quadrant position mapping for findthecenter type
export const QUADRANT_POSITIONS = {
  1: { x: 0.75, y: 0.75 }, // Top-right
  2: { x: 0.25, y: 0.75 }, // Top-left
  3: { x: 0.25, y: 0.25 }, // Bottom-left
  4: { x: 0.75, y: 0.25 }, // Bottom-right
} as const;

// Derive quadrant from position (for display purposes)
export function getQuadrantFromPosition(x: number, y: number): number {
  if (x > 0.5 && y > 0.5) return 1;
  if (x < 0.5 && y > 0.5) return 2;
  if (x < 0.5 && y < 0.5) return 3;
  return 4;
}
