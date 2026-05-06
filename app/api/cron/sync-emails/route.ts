import { NextRequest, NextResponse } from 'next/server';
import { syncSentEmails } from '@/lib/gmail-sync';

export const runtime = 'nodejs';
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = request.headers.get('authorization') || '';
  if (auth === `Bearer ${expected}`) return true;
  const queryToken = request.nextUrl.searchParams.get('token');
  if (queryToken && queryToken === expected) return true;
  return false;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = request.nextUrl;
  const backfillDaysRaw = url.searchParams.get('backfill');
  const maxMessagesRaw = url.searchParams.get('max');

  const opts: { afterEpochSec?: number; maxMessages?: number } = {};
  if (backfillDaysRaw) {
    const days = parseInt(backfillDaysRaw, 10);
    if (Number.isFinite(days) && days > 0) {
      opts.afterEpochSec = Math.floor(Date.now() / 1000) - days * 86400;
    }
  }
  if (maxMessagesRaw) {
    const n = parseInt(maxMessagesRaw, 10);
    if (Number.isFinite(n) && n > 0) opts.maxMessages = n;
  }

  try {
    const summary = await syncSentEmails(opts);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[cron/sync-emails] error', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
