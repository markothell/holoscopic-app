'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { SequenceActivity } from '@/models/Sequence';
import ActivityTypeIcon from '@/components/icons/ActivityTypeIcon';
import type { ActivityType } from '@/models/Activity';

interface ActivityNodeProps {
  data: {
    activity: SequenceActivity;
  };
}

function ActivityNode({ data }: ActivityNodeProps) {
  const { activity } = data;
  const act = activity.activity;

  const now = new Date();
  const openedAt = activity.openedAt ? new Date(activity.openedAt) : null;
  const closedAt = activity.closedAt ? new Date(activity.closedAt) : null;
  const isOpen = openedAt && (!closedAt || now <= closedAt);
  const isClosed = closedAt && now > closedAt;

  const borderColor = isOpen
    ? 'border-emerald-500'
    : isClosed
      ? 'border-gray-600'
      : 'border-gray-700';

  const bgColor = isOpen
    ? 'bg-emerald-900/30'
    : isClosed
      ? 'bg-gray-800/50'
      : 'bg-gray-900/50';

  const statusText = isOpen ? 'Open' : isClosed ? 'Closed' : 'Not Started';
  const statusColor = isOpen
    ? 'text-emerald-400'
    : isClosed
      ? 'text-gray-500'
      : 'text-gray-600';

  const hasParents = (activity.parentActivityIds || []).length > 0;

  return (
    <>
      {hasParents && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-sky-500 !w-2 !h-2 !border-0"
        />
      )}
      <div
        className={`w-[120px] h-[120px] rounded-full ${borderColor} ${bgColor} border-2
          flex flex-col items-center justify-center cursor-pointer
          hover:border-sky-400 hover:bg-sky-900/20 transition-colors`}
      >
        {act?.activityType && (
          <ActivityTypeIcon type={act.activityType as ActivityType} size={16} className="text-gray-400 mb-0.5" />
        )}
        <span className="text-white text-xs font-medium text-center px-3 leading-tight line-clamp-2">
          {act?.title || 'Unknown'}
        </span>
        <span className="text-[10px] text-gray-400 mt-0.5">
          {act?.participants || 0} users
        </span>
        <span className={`text-[10px] mt-0.5 ${statusColor}`}>
          {statusText}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-sky-500 !w-2 !h-2 !border-0"
      />
    </>
  );
}

export default memo(ActivityNode);
