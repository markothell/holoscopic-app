'use client';

import DissolvePositioningSteps from './dissolve/DissolvePositioningSteps';
import ResolvePositioningSteps from './resolve/ResolvePositioningSteps';
import ResultsView from '@/components/ResultsView';
import ResultsViewSimple from '@/components/ResultsViewSimple';
import type { ActivityTypeRegistration } from './registry-types';

export type { TypePositioningStepsProps, ActivityTypeRegistration } from './registry-types';

export const REGISTRY: Record<'dissolve' | 'resolve', ActivityTypeRegistration> = {
  dissolve: {
    totalSteps: 4,
    commentMaxLength: 500,
    PositioningSteps: DissolvePositioningSteps,
    Results: ResultsView,
  },
  resolve: {
    totalSteps: 3,
    PositioningSteps: ResolvePositioningSteps,
    Results: ResultsViewSimple,
  },
};
