import { ComponentType } from 'react';
import { HoloscopicActivity, Rating, ResultsViewProps } from '@/models/Activity';

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
