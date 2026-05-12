'use client';

import type {
  Board,
  BoardResponse,
  Task,
  TaskDetailResponse,
  TaskStatus,
} from './types';

const ACTOR_KEY = 'capconvert-pm-actor';

export function getActor(): string {
  if (typeof window === 'undefined') return 'Someone';
  return window.localStorage.getItem(ACTOR_KEY) || 'Jacque';
}

export function setActor(name: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACTOR_KEY, name.trim() || 'Jacque');
}

function actorHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Actor': getActor(),
  };
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }
  return (await res.json()) as T;
}

export async function fetchBoards(): Promise<Board[]> {
  const res = await fetch('/cortex/api/kanban/boards');
  return handle<Board[]>(res);
}

export async function createBoard(input: { name: string; description?: string }): Promise<Board> {
  const res = await fetch('/cortex/api/kanban/boards', {
    method: 'POST',
    headers: actorHeaders(),
    body: JSON.stringify(input),
  });
  return handle<Board>(res);
}

export async function fetchBoard(boardId: number): Promise<BoardResponse> {
  const res = await fetch(`/cortex/api/kanban/boards/${boardId}`);
  return handle<BoardResponse>(res);
}

export interface CreateTaskInput {
  boardId: number;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  assignee?: string | null;
  dueDate?: string | null;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const res = await fetch('/cortex/api/kanban/tasks', {
    method: 'POST',
    headers: actorHeaders(),
    body: JSON.stringify(input),
  });
  return handle<Task>(res);
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  assignee?: string | null;
  dueDate?: string | null;
}

export async function updateTask(taskId: number, input: UpdateTaskInput): Promise<Task> {
  const res = await fetch(`/cortex/api/kanban/tasks/${taskId}`, {
    method: 'PATCH',
    headers: actorHeaders(),
    body: JSON.stringify(input),
  });
  return handle<Task>(res);
}

export async function reorderTask(
  taskId: number,
  status: TaskStatus,
  position: number,
): Promise<void> {
  const res = await fetch(`/cortex/api/kanban/tasks/${taskId}/reorder`, {
    method: 'PATCH',
    headers: actorHeaders(),
    body: JSON.stringify({ status, position }),
  });
  await handle<void>(res);
}

export async function deleteTask(taskId: number): Promise<void> {
  const res = await fetch(`/cortex/api/kanban/tasks/${taskId}`, {
    method: 'DELETE',
    headers: actorHeaders(),
  });
  await handle<void>(res);
}

export async function fetchTask(taskId: number): Promise<TaskDetailResponse> {
  const res = await fetch(`/cortex/api/kanban/tasks/${taskId}`);
  return handle<TaskDetailResponse>(res);
}
