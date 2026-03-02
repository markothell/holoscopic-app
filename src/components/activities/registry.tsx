import { ComponentType } from 'react';
import { HoloscopicActivity, Rating, ResultsViewProps } from '@/models/Activity';
import DissolvePositioningSteps from './dissolve/DissolvePositioningSteps';
import ResolvePositioningSteps from './resolve/ResolvePositioningSteps';
import ResultsView from '@/components/ResultsView';
import ResultsViewSimple from '@/components/ResultsViewSimple';

export interface TypePositioningStepsProps {
  activity: HoloscopicActivity;
  step: number;
  xValue: number;
  yValue: number;
  onXChange: (v: number) => void;
  onYChange: (v: number) => void;
  objectName: string;
  existingRating?: Rating;
}

export interface ActivityTypeRegistration {
  totalSteps: number;
  commentMaxLength?: number;
  PositioningSteps: ComponentType<TypePositioningStepsProps>;
  Results: ComponentType<ResultsViewProps>;
}

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
