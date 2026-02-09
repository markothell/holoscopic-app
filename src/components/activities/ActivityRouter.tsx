'use client';

import { HoloscopicActivity } from '@/models/Activity';
import { normalizeActivityType } from './types';
import DissolveActivity from './dissolve/DissolveActivity';
import ResolveActivity from './resolve/ResolveActivity';

interface ActivityRouterProps {
  activity: HoloscopicActivity;
  sequenceId?: string;
}

/**
 * ActivityRouter - Routes to the appropriate activity component based on activityType
 *
 * This component serves as the entry point for rendering activities.
 * It examines the activity's type and renders the corresponding component.
 */
export default function ActivityRouter({ activity, sequenceId }: ActivityRouterProps) {
  const activityType = normalizeActivityType(activity.activityType || 'dissolve');

  switch (activityType) {
    case 'resolve':
      return <ResolveActivity activity={activity} sequenceId={sequenceId} />;

    case 'dissolve':
    default:
      return <DissolveActivity activity={activity} sequenceId={sequenceId} />;
  }
}
