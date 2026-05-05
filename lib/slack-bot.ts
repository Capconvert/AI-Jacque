const SLACK_API = 'https://slack.com/api';

function botToken(): string {
  const t = process.env.SLACK_BOT_TOKEN;
  if (!t) throw new Error('SLACK_BOT_TOKEN env var is not set');
  return t;
}

interface SlackResponse {
  ok: boolean;
  error?: string;
  [k: string]: unknown;
}

async function slackPost(method: string, body: Record<string, unknown>): Promise<SlackResponse> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken()}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as SlackResponse;
}

async function slackGet(method: string, params: Record<string, string>): Promise<SlackResponse> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${SLACK_API}/${method}?${qs}`, {
    headers: { Authorization: `Bearer ${botToken()}` },
  });
  return (await res.json()) as SlackResponse;
}

export interface PostMessageInput {
  channel: string;
  text: string;
  thread_ts?: string;
}

export async function slackPostMessage(input: PostMessageInput): Promise<SlackResponse> {
  return slackPost('chat.postMessage', input as unknown as Record<string, unknown>);
}

export interface ThreadMessage {
  user?: string;
  bot_id?: string;
  text?: string;
  ts: string;
}

export async function slackThreadReplies(channel: string, threadTs: string): Promise<ThreadMessage[]> {
  const r = await slackGet('conversations.replies', { channel, ts: threadTs, limit: '20' });
  if (!r.ok) return [];
  return (r.messages as ThreadMessage[] | undefined) || [];
}

export interface SlackUser {
  id: string;
  team_id?: string;
  is_bot?: boolean;
  real_name?: string;
  profile?: { real_name?: string; display_name?: string; first_name?: string };
}

let cachedBotTeamId: string | null = null;

export async function getBotTeamId(): Promise<string | null> {
  if (cachedBotTeamId) return cachedBotTeamId;
  const r = await slackPost('auth.test', {});
  if (r.ok && typeof r.team_id === 'string') {
    cachedBotTeamId = r.team_id as string;
    return cachedBotTeamId;
  }
  return null;
}

export async function isInternalUser(userId: string): Promise<boolean> {
  const [user, botTeam] = await Promise.all([slackUserInfo(userId), getBotTeamId()]);
  if (!user || !botTeam) return false;
  if (!user.team_id) return false;
  return user.team_id === botTeam;
}

export async function slackUserInfo(userId: string): Promise<SlackUser | null> {
  const r = await slackGet('users.info', { user: userId });
  if (!r.ok) return null;
  return (r.user as SlackUser | undefined) || null;
}

export function pickFirstName(user: SlackUser | null): string | null {
  if (!user) return null;
  const first = user.profile?.first_name;
  if (first) return first;
  const real = user.profile?.real_name || user.real_name;
  if (real) return real.split(/\s+/)[0];
  return null;
}

export function stripMentions(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+>/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
