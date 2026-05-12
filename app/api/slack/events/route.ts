import { NextRequest, NextResponse } from 'next/server';
import { verifySlackSignature } from '@/lib/slack-verify';
import {
  slackPostMessage,
  slackThreadReplies,
  slackUserInfo,
  pickFirstName,
  stripMentions,
  getBotTeamId,
  getBotUserId,
} from '@/lib/slack-bot';
import { askAIJacque, findClientByName } from '@/lib/ai-jacque';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface SlackEvent {
  type: string;
  subtype?: string;
  user?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
}

interface SlackEventPayload {
  type: 'url_verification' | 'event_callback';
  challenge?: string;
  event?: SlackEvent;
  event_id?: string;
}

const seenEvents = new Map<string, number>();
function alreadySeen(eventId: string): boolean {
  const now = Date.now();
  for (const [k, v] of seenEvents) {
    if (now - v > 5 * 60 * 1000) seenEvents.delete(k);
  }
  if (seenEvents.has(eventId)) return true;
  seenEvents.set(eventId, now);
  return false;
}

async function botPostedInThread(channel: string, threadTs: string, botUserId: string | null): Promise<boolean> {
  const replies = await slackThreadReplies(channel, threadTs);
  if (!replies.length) return false;
  return replies.some((r) => Boolean(r.bot_id) || (botUserId && r.user === botUserId));
}

async function processQuestion(event: SlackEvent) {
  if (!event.channel || !event.text || !event.user) return;
  const question = stripMentions(event.text);
  if (!question) return;

  const userInfo = await slackUserInfo(event.user);
  const employeeFirstName = pickFirstName(userInfo);

  let history = '';
  if (event.thread_ts && event.thread_ts !== event.ts) {
    const replies = await slackThreadReplies(event.channel, event.thread_ts);
    const lines: string[] = [];
    for (const r of replies) {
      if (r.ts === event.ts) continue;
      const text = stripMentions(r.text || '');
      if (!text) continue;
      const role = r.bot_id ? 'Cortex' : (employeeFirstName ? `Capconvert teammate ${employeeFirstName}` : 'Capconvert teammate');
      lines.push(`[${role}]: ${text}`);
    }
    history = lines.slice(-10).join('\n\n');
  }

  const surface = event.channel_type === 'im' ? 'a Slack DM' : `Slack #${event.channel}`;
  const employeeContext = employeeFirstName
    ? `Capconvert teammate ${employeeFirstName} is asking from ${surface}. Default to INTERNAL mode unless they explicitly frame a client question.`
    : `Capconvert teammate is asking from ${surface}. Default to INTERNAL mode unless they explicitly frame a client question.`;
  const questionWithContext = `${employeeContext}\n\nQuestion: ${question}`;

  const clientId = await findClientByName(question, history);
  const result = await askAIJacque(clientId, questionWithContext, history, [], null);

  const answer = 'error' in result ? `Hit an error: ${result.error}` : result.answer;

  await slackPostMessage({
    channel: event.channel,
    text: answer,
    thread_ts: event.thread_ts || event.ts,
  });
}

async function isInternal(userId: string): Promise<boolean> {
  try {
    const [user, botTeam] = await Promise.all([slackUserInfo(userId), getBotTeamId()]);
    if (!user || !botTeam || !user.team_id) return true;
    return user.team_id === botTeam;
  } catch {
    return true;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const timestamp = request.headers.get('x-slack-request-timestamp') || '';
  const signature = request.headers.get('x-slack-signature') || '';
  const signingSecret = process.env.SLACK_SIGNING_SECRET || '';

  if (!verifySlackSignature(rawBody, timestamp, signature, signingSecret)) {
    return new NextResponse('invalid signature', { status: 401 });
  }

  const retry = request.headers.get('x-slack-retry-num');
  if (retry && Number(retry) >= 1) {
    return NextResponse.json({ ok: true });
  }

  let payload: SlackEventPayload;
  try {
    payload = JSON.parse(rawBody) as SlackEventPayload;
  } catch {
    return new NextResponse('invalid json', { status: 400 });
  }

  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type !== 'event_callback' || !payload.event) {
    return NextResponse.json({ ok: true });
  }

  const event = payload.event;

  if (payload.event_id && alreadySeen(payload.event_id)) {
    return NextResponse.json({ ok: true });
  }
  if (event.bot_id) {
    return NextResponse.json({ ok: true });
  }
  if (event.subtype) {
    // ignore message_changed, message_deleted, channel_join, etc.
    return NextResponse.json({ ok: true });
  }
  if (!event.user || !event.text || !event.channel) {
    return NextResponse.json({ ok: true });
  }
  if (!(await isInternal(event.user))) {
    return NextResponse.json({ ok: true });
  }

  let shouldRespond = false;

  if (event.type === 'app_mention') {
    shouldRespond = true;
  } else if (event.type === 'message') {
    const botUserId = await getBotUserId();
    // Skip if @mention (app_mention will fire separately)
    if (botUserId && event.text.includes(`<@${botUserId}>`)) {
      return NextResponse.json({ ok: true });
    }
    if (event.channel_type === 'im') {
      shouldRespond = true;
    } else if (event.thread_ts && event.thread_ts !== event.ts) {
      shouldRespond = await botPostedInThread(event.channel, event.thread_ts, botUserId);
    }
  }

  if (!shouldRespond) {
    return NextResponse.json({ ok: true });
  }

  console.log('[slack-bot] processing', { type: event.type, channel: event.channel, ts: event.ts });

  try {
    await slackPostMessage({
      channel: event.channel,
      text: 'thinking...',
      thread_ts: event.thread_ts || event.ts,
    });
  } catch (err) {
    console.warn('[slack-bot] ack post failed', err);
  }

  try {
    await processQuestion(event);
    console.log('[slack-bot] processQuestion done', event.ts);
  } catch (err) {
    console.error('[slack-bot] processQuestion failed', err);
    await slackPostMessage({
      channel: event.channel,
      text: `Hit an error processing that: ${err instanceof Error ? err.message : String(err)}`,
      thread_ts: event.thread_ts || event.ts,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
