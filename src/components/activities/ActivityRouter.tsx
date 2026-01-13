'use client';

import { HoloscopicActivity } from '@/models/Activity';
import HoloscopicActivityComponent from './holoscopic/HoloscopicActivity';
import FindTheCenterActivity from './findthecenter/FindTheCenterActivity';

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
  // Default to holoscopic if activityType is not set (backwards compatibility)
  const activityType = activity.activityType || 'holoscopic';

  console.log('=== ACTIVITY ROUTER ===');
  console.log('Activity ID:', activity.id);
  console.log('Activity Type:', activityType);
  console.log('Activity Title:', activity.title);

  switch (activityType) {
    case 'findthecenter':
      console.log('Routing to FindTheCenterActivity');
      return <FindTheCenterActivity activity={activity} sequenceId={sequenceId} />;

    case 'holoscopic':
    default:
      console.log('Routing to HoloscopicActivity');
      return <HoloscopicActivityComponent activity={activity} sequenceId={sequenceId} />;
  }
}
