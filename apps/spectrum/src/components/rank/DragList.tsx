'use client';

import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Anything with an id and a display name can be ranked or reordered —
// people, entries, or the game's own round structure.
export interface DragItem {
  id: string;
  name: string;
}

function Row({
  member,
  index,
  total,
  accent,
  hasStory,
  onStory,
}: {
  member: DragItem;
  index: number;
  total: number;
  accent: string;
  hasStory: boolean;
  onStory: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: member.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        boxShadow: isDragging ? 'var(--shadow-card)' : undefined,
      }}
      className={`flex items-center gap-3 rounded-2xl border bg-paper-raised px-3 py-3 ${
        isDragging ? 'border-ink' : 'border-line'
      }`}
    >
      {/* Drag handle — the only touch-action:none surface, so the list still scrolls */}
      <button
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${member.name}`}
        className="shrink-0 cursor-grab touch-none px-1 py-2 text-ink-faint active:cursor-grabbing"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
          <circle cx="4" cy="3" r="1.4" /><circle cx="10" cy="3" r="1.4" />
          <circle cx="4" cy="7" r="1.4" /><circle cx="10" cy="7" r="1.4" />
          <circle cx="4" cy="11" r="1.4" /><circle cx="10" cy="11" r="1.4" />
        </svg>
      </button>
      <span
        className="eyebrow w-6 shrink-0 text-center"
        style={{ color: index === 0 || index === total - 1 ? accent : undefined }}
      >
        {index + 1}
      </span>
      <span className="display min-w-0 flex-1 truncate text-2xl">{member.name}</span>
      <button
        onClick={onStory}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
          hasStory ? 'border-transparent text-white' : 'border-line-strong text-ink-soft'
        }`}
        style={hasStory ? { background: accent } : undefined}
      >
        {hasStory ? 'story ✓' : '+ story'}
      </button>
    </li>
  );
}

export default function DragList({
  members,
  order,
  onReorder,
  accent,
  storiesFor,
  onStory,
}: {
  members: Map<string, DragItem>;
  order: string[];
  onReorder: (next: string[]) => void;
  accent: string;
  storiesFor: Set<string>;
  onStory: (member: DragItem) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const from = order.indexOf(String(active.id));
      const to = order.indexOf(String(over.id));
      onReorder(arrayMove(order, from, to));
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {order.map((id, i) => {
            const m = members.get(id)!;
            return (
              <Row
                key={id}
                member={m}
                index={i}
                total={order.length}
                accent={accent}
                hasStory={storiesFor.has(id)}
                onStory={() => onStory(m)}
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
