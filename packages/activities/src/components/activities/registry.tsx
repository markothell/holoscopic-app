'use client';

import DissolvePositioningSteps from './dissolve/DissolvePositioningSteps';
import ResolvePositioningSteps from './resolve/ResolvePositioningSteps';
import SnapshotPositioningSteps from './snapshot/SnapshotPositioningSteps';
import ResultsView from '../ResultsView';
import ResultsViewSimple from '../ResultsViewSimple';
import SnapshotResults from './snapshot/SnapshotResults';
import DissolveCreatePanel from './dissolve/DissolveCreatePanel';
import ResolveCreatePanel from './resolve/ResolveCreatePanel';
import SnapshotCreatePanel from './snapshot/SnapshotCreatePanel';
import type { ActivityTypeRegistration } from './registry-types';

export type { TypePositioningStepsProps, ActivityTypeRegistration } from './registry-types';

export const REGISTRY: Record<'dissolve' | 'resolve' | 'snapshot', ActivityTypeRegistration> = {
  dissolve: {
    totalSteps: 4,
    commentMaxLength: 500,
    PositioningSteps: DissolvePositioningSteps,
    Results: ResultsView,
    CreatePanel: DissolveCreatePanel,
  },
  resolve: {
    totalSteps: 3,
    PositioningSteps: ResolvePositioningSteps,
    Results: ResultsViewSimple,
    CreatePanel: ResolveCreatePanel,
  },
  snapshot: {
    // totalSteps is computed dynamically in EntryModal based on question count; 3 is a fallback
    totalSteps: 3,
    PositioningSteps: SnapshotPositioningSteps,
    Results: SnapshotResults,
    CreatePanel: SnapshotCreatePanel,
  },
};
