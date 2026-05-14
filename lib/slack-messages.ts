import type { SlackMessagePayload } from './slack';

export type TaskStatus = 'TODO' | 'DOING' | 'DONE';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'To Do',
  DOING: 'Doing',
  DONE: 'Done',
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

const CAPCONVERT_CYAN = '#00ceff';
const DONE_GREEN = '#22c55e';
const REOPEN_GRAY = '#6b7280';

function taskUrl(taskId: number | string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/pm/kanban?task=${taskId}`;
}

function mrkdwn(text: string) {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

function linkLine(label: string, url: string) {
  return `<${url}|${label}>`;
}

export interface TaskCreatedInput {
  taskId: number;
  title: string;
  boardName: string;
  priority: TaskPriority;
  assignee: string | null;
  creator: string;
}

export function formatTaskCreated(input: TaskCreatedInput): SlackMessagePayload {
  const url = taskUrl(input.taskId);
  const lines = [
    `:sparkles: *New task created*`,
    `*Title:* ${input.title}`,
    `*Board:* ${input.boardName}`,
    `*Status:* ${STATUS_LABEL.TODO}`,
    `*Priority:* ${PRIORITY_LABEL[input.priority]}`,
    `*Assignee:* ${input.assignee || 'Unassigned'}`,
    `*Created by:* ${input.creator}`,
    linkLine('Open in Capconvert Ops', url),
  ];
  return {
    text: `New task created: ${input.title}`,
    attachments: [
      {
        color: CAPCONVERT_CYAN,
        blocks: [mrkdwn(lines.join('\n'))],
      },
    ],
  };
}

export interface TaskMovedInput {
  taskId: number;
  title: string;
  oldStatus: TaskStatus;
  newStatus: TaskStatus;
  actor: string;
}

export function formatTaskMoved(input: TaskMovedInput): SlackMessagePayload {
  const url = taskUrl(input.taskId);
  let color = CAPCONVERT_CYAN;
  if (input.newStatus === 'TODO') color = REOPEN_GRAY;
  else if (input.newStatus === 'DOING' && input.oldStatus === 'TODO') color = CAPCONVERT_CYAN;

  const lines = [
    `:arrow_right: *Task moved*`,
    `*${input.title}*`,
    `${STATUS_LABEL[input.oldStatus]} → ${STATUS_LABEL[input.newStatus]}`,
    `*Moved by:* ${input.actor}`,
    linkLine('Open', url),
  ];
  return {
    text: `Task moved: ${input.title} (${STATUS_LABEL[input.oldStatus]} → ${STATUS_LABEL[input.newStatus]})`,
    attachments: [{ color, blocks: [mrkdwn(lines.join('\n'))] }],
  };
}

export interface TaskFieldChange {
  label: string;
  oldValue: string;
  newValue: string;
}

export interface TaskUpdatedInput {
  taskId: number;
  title: string;
  actor: string;
  changes: TaskFieldChange[];
}

export function formatTaskUpdated(input: TaskUpdatedInput): SlackMessagePayload {
  const url = taskUrl(input.taskId);
  const changeLines = input.changes.map(
    (c) => `• *${c.label}:* "${c.oldValue}" → "${c.newValue}"`,
  );
  const lines = [
    `:pencil2: *Task updated*`,
    `*${input.title}*`,
    ...changeLines,
    `*By:* ${input.actor}`,
    linkLine('Open', url),
  ];
  return {
    text: `Task updated: ${input.title}`,
    attachments: [{ color: CAPCONVERT_CYAN, blocks: [mrkdwn(lines.join('\n'))] }],
  };
}

export interface TaskCompletedInput {
  taskId: number;
  title: string;
  actor: string;
  timeInDoingMs: number | null;
}

export function formatTaskCompleted(input: TaskCompletedInput): SlackMessagePayload {
  const url = taskUrl(input.taskId);
  const lines = [
    `:white_check_mark: *Task completed*`,
    `*${input.title}*`,
    `*Completed by:* ${input.actor}`,
    `*Time in Doing:* ${humanizeDuration(input.timeInDoingMs)}`,
    linkLine('Open', url),
  ];
  return {
    text: `Task completed: ${input.title}`,
    attachments: [{ color: DONE_GREEN, blocks: [mrkdwn(lines.join('\n'))] }],
  };
}

export function humanizeDuration(ms: number | null): string {
  if (ms === null || ms < 0) return 'unknown';
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return 'under 1 minute';
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes && days === 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ') || 'under 1 minute';
}
