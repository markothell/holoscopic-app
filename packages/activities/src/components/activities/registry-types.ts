import { ComponentType } from 'react';
import { HoloscopicActivity, Rating, Comment, SnapshotAnswer, ResultsViewProps, ActivityFormData } from '../../types/Activity';

export interface TypePositioningStepsProps {
  activity: HoloscopicActivity;
  step: number;
  xValue: number;
  yValue: number;
  onXChange: (v: number) => void;
  onYChange: (v: number) => void;
  objectName: string;
  existingRating?: Rating;
  existingComment?: Comment;
  // Snapshot only: called when answers are updated so EntryModal can include them on submit
  onSnapshotAnswersChange?: (answers: SnapshotAnswer[]) => void;
  // Snapshot only: when set, only show this question's flow (single-question mode)
  snapshotQuestionId?: string;
}

export interface TypeCreatePanelProps {
  formData: ActivityFormData;
  setFormData: React.Dispatch<React.SetStateAction<ActivityFormData>>;
  validationErrors: Record<string, string>;
  editingActivity?: HoloscopicActivity;
  // Starter data sync (dissolve/resolve only)
  onSyncStarterData?: () => void;
  isSyncing?: boolean;
  syncMessage?: string | null;
}

export interface ActivityTypeRegistration {
  totalSteps: number;
  commentMaxLength?: number;
  PositioningSteps: ComponentType<TypePositioningStepsProps>;
  Results: ComponentType<ResultsViewProps>;
  CreatePanel: ComponentType<TypeCreatePanelProps>;
}
