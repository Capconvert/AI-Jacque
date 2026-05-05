import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { verifySlackSignature } from '@/lib/slack-verify';
import {
  slackPostMessage,
  slackThreadReplies,
  slackUserInfo,
  pickFirstName,
  stripMentions,
} from '@/lib/slack-bot';
import { askAIJacque, findClientByName } from '@/lib/ai-jacque';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface SlackEvent {
  type: string;
  user?: string;
  text?: string;
  channel?: string;
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

async function processMention(event: SlackEvent) {
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
      const role = r.bot_id ? 'AI Jacque' : (employeeFirstName ? `Capconvert teammate ${employeeFirstName}` : 'Capconvert teammate');
      lines.push(`[${role}]: ${text}`);
    }
    history = lines.slice(-10).join('\n\n');
  }

  const employeeContext = employeeFirstName
    ? `Capconvert teammate ${employeeFirstName} is asking from Slack #${event.channel}. Default to INTERNAL mode unless they explicitly frame a client question.`
    : `Capconvert teammate is asking from Slack. Default to INTERNAL mode unless they explicitly frame a client question.`;
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

  if (payload.type === 'event_callback' && payload.event?.type === 'app_mention') {
    if (payload.event_id && alreadySeen(payload.event_id)) {
      return NextResponse.json({ ok: true });
    }
    if (payload.event.bot_id) {
      return NextResponse.json({ ok: true });
    }

    const eventCopy = payload.event;
    after(async () => {
      try {
        await processMention(eventCopy);
      } catch (err) {
        console.error('[slack-bot] processMention failed', err);
        if (eventCopy.channel) {
          await slackPostMessage({
            channel: eventCopy.channel,
            text: `Hit an error processing that: ${err instanceof Error ? err.message : String(err)}`,
            thread_ts: eventCopy.thread_ts || eventCopy.ts,
          }).catch(() => {});
        }
      }
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
