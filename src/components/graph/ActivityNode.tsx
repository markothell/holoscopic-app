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

  const borderStyle = isOpen
    ? { borderColor: '#1A4FD4' }
    : isClosed
      ? { borderColor: '#D9D4CC' }
      : { borderColor: 'rgba(215, 205, 195, 0.3)' };

  const bgStyle = isOpen
    ? { background: 'rgba(26, 79, 212, 0.08)' }
    : isClosed
      ? { background: 'rgba(0, 0, 0, 0.03)' }
      : { background: 'rgba(255, 255, 255, 0.5)' };

  const statusText = isOpen ? 'Open' : isClosed ? 'Closed' : 'Not Started';
  const statusStyle = isOpen
    ? { color: '#1A4FD4' }
    : isClosed
      ? { color: '#6B6560' }
      : { color: '#D9D4CC' };

  const hasParents = (activity.parentActivityIds || []).length > 0;

  return (
    <>
      {hasParents && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: '#C83B50', width: 8, height: 8, border: 'none' }}
        />
      )}
      <div
        className="w-[120px] h-[120px] rounded-full border-2 flex flex-col items-center justify-center cursor-pointer transition-colors"
        style={{ ...borderStyle, ...bgStyle }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#C83B50';
          e.currentTarget.style.background = 'rgba(200, 59, 80, 0.06)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = borderStyle.borderColor;
          e.currentTarget.style.background = bgStyle.background;
        }}
      >
        {act?.activityType && (
          <ActivityTypeIcon type={act.activityType as ActivityType} size={16} className="mb-0.5 text-[#6B6560]" />
        )}
        <span className="text-xs font-medium text-center px-3 leading-tight line-clamp-2" style={{ color: '#0F0D0B' }}>
          {act?.title || 'Unknown'}
        </span>
        <span className="text-[10px] mt-0.5" style={{ color: '#6B6560' }}>
          {act?.participants || 0} users
        </span>
        <span className="text-[10px] mt-0.5" style={statusStyle}>
          {statusText}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#C83B50', width: 8, height: 8, border: 'none' }}
      />
    </>
  );
}

export default memo(ActivityNode);
