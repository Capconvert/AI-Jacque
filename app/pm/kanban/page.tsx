'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Column } from './Column';
import { TaskCard } from './TaskCard';
import { TaskDrawer } from './TaskDrawer';
import { QuickAddModal } from './QuickAddModal';
import {
  createTask,
  fetchBoard,
  fetchBoards,
  getActor,
  reorderTask,
  setActor,
} from './api';
import { STATUSES, type BoardResponse, type Task, type TaskStatus } from './types';

export default function KanbanPage() {
  const qc = useQueryClient();

  const boardsQuery = useQuery({ queryKey: ['boards'], queryFn: fetchBoards });
  const boards = boardsQuery.data ?? [];
  const [manualBoardId, setManualBoardId] = useState<number | null>(null);
  const boardId: number | null =
    manualBoardId !== null && boards.some((b) => b.id === manualBoardId)
      ? manualBoardId
      : boards[0]?.id ?? null;

  const boardQuery = useQuery<BoardResponse>({
    queryKey: ['board', boardId],
    queryFn: () => fetchBoard(boardId as number),
    enabled: boardId !== null,
  });

  const [actorName, setActorName] = useState<string>(() =>
    typeof window === 'undefined' ? 'Jacque' : getActor(),
  );

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get('task');
    return t && /^\d+$/.test(t) ? Number(t) : null;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (selectedTaskId === null) url.searchParams.delete('task');
    else url.searchParams.set('task', String(selectedTaskId));
    window.history.replaceState({}, '', url.toString());
  }, [selectedTaskId]);

  const [quickAddOpen, setQuickAddOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setQuickAddOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const tasksByStatus = boardQuery.data?.tasksByStatus;

  const createTaskMutation = useMutation({
    mutationFn: (input: Parameters<typeof createTask>[0]) => createTask(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: ({
      taskId,
      status,
      position,
    }: {
      taskId: number;
      status: TaskStatus;
      position: number;
    }) => reorderTask(taskId, status, position),
    onMutate: async ({ taskId, status, position }) => {
      await qc.cancelQueries({ queryKey: ['board', boardId] });
      const prev = qc.getQueryData<BoardResponse>(['board', boardId]);
      if (!prev) return { prev };
      qc.setQueryData<BoardResponse>(['board', boardId], (old) => {
        if (!old) return old;
        return applyOptimisticReorder(old, taskId, status, position);
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['board', boardId], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });

  function handleDragStart(e: DragStartEvent) {
    const taskId = Number(e.active.id);
    const task = boardQuery.data?.tasks.find((t) => t.id === taskId) || null;
    setActiveTask(task);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveTask(null);
    if (!boardQuery.data || !e.over || boardId === null) return;

    const activeId = Number(e.active.id);
    const overId = e.over.id;
    const draggingTask = boardQuery.data.tasks.find((t) => t.id === activeId);
    if (!draggingTask) return;

    // Determine destination column and target position.
    let destStatus: TaskStatus;
    let targetPosition: number;

    if (typeof overId === 'string' && overId.startsWith('column-')) {
      destStatus = overId.slice('column-'.length) as TaskStatus;
      const destTasks = boardQuery.data.tasksByStatus[destStatus];
      targetPosition = destTasks.filter((t) => t.id !== activeId).length;
    } else {
      const overTask = boardQuery.data.tasks.find((t) => t.id === Number(overId));
      if (!overTask) return;
      destStatus = overTask.status;
      const destTasks = boardQuery.data.tasksByStatus[destStatus].filter(
        (t) => t.id !== activeId,
      );
      const idx = destTasks.findIndex((t) => t.id === overTask.id);
      targetPosition = idx === -1 ? destTasks.length : idx;
    }

    if (
      destStatus === draggingTask.status &&
      draggingTask.position === targetPosition
    ) {
      return;
    }

    reorderMutation.mutate({ taskId: activeId, status: destStatus, position: targetPosition });
  }

  function handleQuickAddInline(title: string, status: TaskStatus) {
    if (boardId === null) return;
    createTaskMutation.mutate({
      boardId,
      title,
      status,
      assignee: actorName || null,
    });
  }

  const loading =
    boardsQuery.isLoading || (boardId !== null && boardQuery.isLoading) || boardId === null;

  return (
    <main className="min-h-screen bg-black text-neutral-100 flex flex-col">
      <header className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-neutral-900">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-wide text-[#00ceff]">
            Capconvert PM
          </span>
          <span className="text-neutral-700">|</span>
          <BoardSelect
            boards={boards}
            value={boardId}
            onChange={setManualBoardId}
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <ActorInput
            value={actorName}
            onChange={(v) => {
              setActorName(v);
              setActor(v);
            }}
          />
          <button
            onClick={() => setQuickAddOpen(true)}
            className="px-3 py-1.5 text-xs font-medium bg-[#00ceff] text-black rounded hover:opacity-90"
          >
            + Task
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
          Loading board…
        </div>
      ) : !tasksByStatus ? (
        <EmptyState onInit={() => fetch('/cortex/api/kanban/init', { method: 'POST' }).then(() => boardsQuery.refetch())} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveTask(null)}
        >
          <div className="flex-1 overflow-x-auto overflow-y-hidden px-5 py-4">
            <div className="flex gap-4 h-full">
              {STATUSES.map((s) => (
                <Column
                  key={s}
                  status={s}
                  tasks={tasksByStatus[s]}
                  onOpenTask={setSelectedTaskId}
                  onQuickAdd={handleQuickAddInline}
                />
              ))}
            </div>
          </div>
          <DragOverlay>
            {activeTask ? (
              <div className="w-[316px]">
                <TaskCard task={activeTask} onOpen={() => {}} isDragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <QuickAddModal
        open={quickAddOpen}
        boardName={boardQuery.data?.board.name ?? 'Board'}
        defaultAssignee={actorName}
        onClose={() => setQuickAddOpen(false)}
        onCreate={(input) => {
          if (boardId === null) return;
          createTaskMutation.mutate({
            boardId,
            title: input.title,
            description: input.description,
            status: input.status,
            priority: input.priority,
            assignee: input.assignee,
            dueDate: input.dueDate,
          });
          setQuickAddOpen(false);
        }}
      />

      <TaskDrawer
        taskId={selectedTaskId}
        boardId={boardId ?? 0}
        onClose={() => setSelectedTaskId(null)}
      />
    </main>
  );
}

function BoardSelect({
  boards,
  value,
  onChange,
}: {
  boards: { id: number; name: string }[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  if (boards.length === 0) return <span className="text-sm text-neutral-500">No boards</span>;
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
      className="bg-neutral-900 border border-neutral-800 focus:border-[#00ceff] rounded px-2 py-1 text-sm text-neutral-100 focus:outline-none"
    >
      {boards.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}

function ActorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-400">
      <span>You</span>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-neutral-900 border border-neutral-800 focus:border-[#00ceff] rounded px-2 py-1 text-neutral-100 w-28 focus:outline-none"
        placeholder="Name"
      />
    </label>
  );
}

function EmptyState({ onInit }: { onInit: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-500">
      <p>No boards yet — initialize the schema to get started.</p>
      <button
        onClick={onInit}
        className="px-3 py-1.5 text-xs bg-[#00ceff] text-black rounded hover:opacity-90"
      >
        Initialize kanban
      </button>
    </div>
  );
}

function applyOptimisticReorder(
  old: BoardResponse,
  taskId: number,
  destStatus: TaskStatus,
  targetPosition: number,
): BoardResponse {
  const task = old.tasks.find((t) => t.id === taskId);
  if (!task) return old;

  const remaining = old.tasks.filter((t) => t.id !== taskId);
  const destCol = remaining
    .filter((t) => t.status === destStatus)
    .sort((a, b) => a.position - b.position);

  const inserted = { ...task, status: destStatus };
  const clampedPos = Math.max(0, Math.min(targetPosition, destCol.length));
  destCol.splice(clampedPos, 0, inserted);
  const renumberedDest = destCol.map((t, i) => ({ ...t, position: i }));

  const otherCols = remaining
    .filter((t) => t.status !== destStatus)
    .sort((a, b) => a.position - b.position);

  // Renumber the source column if it differs from destination.
  const grouped: Record<TaskStatus, Task[]> = { TODO: [], DOING: [], DONE: [] };
  for (const t of otherCols) grouped[t.status].push(t);
  for (const t of renumberedDest) grouped[t.status].push(t);
  // Reposition each column by current order in grouped (source column already compacted by removal).
  (Object.keys(grouped) as TaskStatus[]).forEach((s) => {
    grouped[s] = grouped[s].map((t, i) => ({ ...t, position: i }));
  });

  const allTasks = [...grouped.TODO, ...grouped.DOING, ...grouped.DONE];

  return {
    ...old,
    tasks: allTasks,
    tasksByStatus: grouped,
  };
}
