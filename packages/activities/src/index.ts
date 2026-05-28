// Types
export * from './types/Activity';

// Activity registry
export { REGISTRY } from './components/activities/registry';
export type { TypePositioningStepsProps, ActivityTypeRegistration } from './components/activities/registry';

// Activity type utilities
export {
  normalizeActivityType,
  getActivityTypeConfig,
  getActivityTypeLabel,
  getActivityTypeIcon,
  getAllActivityTypes,
  QUADRANT_POSITIONS,
  getQuadrantFromPosition,
  ACTIVITY_TYPES,
} from './components/activities/types';
export type { ActivityTypeConfig } from './components/activities/types';

// Utilities
export { FormattingService } from './utils/formatting';
export { ValidationService } from './utils/validation';
export { UrlUtils } from './utils/urlUtils';

// Components
export { default as MappingGrid } from './components/MappingGrid';
export { default as DotGrid } from './components/DotGrid';
export { default as ResultsView } from './components/ResultsView';
export { default as ResultsViewSimple } from './components/ResultsViewSimple';
export { default as PauseOverlay } from './components/PauseOverlay';
export { default as CollapsibleSection } from './components/CollapsibleSection';
export { default as ActivityTypeIcon } from './components/icons/ActivityTypeIcon';
export { default as CommentSection } from './components/CommentSection';
export { default as CommentPopup } from './components/CommentPopup';
