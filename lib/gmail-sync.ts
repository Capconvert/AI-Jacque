import { sql } from '@vercel/postgres';
import crypto from 'node:crypto';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';
const USER_EMAIL = process.env.GMAIL_USER_EMAIL || 'jacque@capconvert.com';

interface CachedToken {
  value: string;
  expiresAt: number;
}
let cachedAccessToken: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) {
    return cachedAccessToken.value;
  }
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID || process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET || process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail OAuth env vars not set (GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_REFRESH_TOKEN)');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Gmail token refresh ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { value: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

async function gmailGet<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail GET ${path} ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function getHeader(part: GmailMessagePart | undefined, name: string): string {
  if (!part?.headers) return '';
  const h = part.headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

function findPart(part: GmailMessagePart | undefined, mime: string): GmailMessagePart | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return part;
  for (const sub of part.parts ?? []) {
    const found = findPart(sub, mime);
    if (found) return found;
  }
  return null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>(?:\s*)/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function extractBody(payload: GmailMessagePart | undefined): string {
  const textPart = findPart(payload, 'text/plain');
  if (textPart?.body?.data) {
    return decodeBase64Url(textPart.body.data);
  }
  const htmlPart = findPart(payload, 'text/html');
  if (htmlPart?.body?.data) {
    return htmlToText(decodeBase64Url(htmlPart.body.data));
  }
  return '';
}

const REPLY_MARKERS: RegExp[] = [
  /^On\s.+\swrote:\s*$/m,
  /^On\s.+,\s.+\swrote:\s*$/m,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/m,
  /^_{5,}\s*$\nFrom:\s/m,
  /^From:\s.+\nSent:\s/m,
  /^From:\s.+\nDate:\s/m,
  /^Sent from my (iPhone|iPad|Android|Galaxy)/m,
  /^Get Outlook for (iOS|Android)/m,
];

function stripQuotedReply(text: string): string {
  let cutAt = text.length;
  for (const re of REPLY_MARKERS) {
    const m = re.exec(text);
    if (m && m.index < cutAt) cutAt = m.index;
  }
  let out = text.slice(0, cutAt);
  out = out.replace(/^>.*$/gm, '');
  return out.trim();
}

function stripSignature(text: string): string {
  const sigDelim = /\n--\s*\n/;
  const m = sigDelim.exec(text);
  if (m) return text.slice(0, m.index).trim();
  const lines = text.split('\n');
  const tailWindow = Math.min(8, lines.length);
  for (let i = lines.length - tailWindow; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^(thanks|thank you|cheers|best|regards|talk soon|talk(ed)? next week)[,!.]?$/i.test(line)) {
      const rest = lines.slice(i + 1, Math.min(i + 6, lines.length)).join('\n');
      if (/jacque/i.test(rest) || /capconvert/i.test(rest)) {
        return lines.slice(0, i).join('\n').trim();
      }
    }
  }
  return text.trim();
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanBody(raw: string): string {
  return normalizeWhitespace(stripSignature(stripQuotedReply(raw)));
}

function extractDomains(headerValue: string): string[] {
  if (!headerValue) return [];
  const re = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(headerValue)) !== null) {
    out.push(m[1].toLowerCase());
  }
  return out;
}

function urlHost(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
}

function registrableDomain(host: string): string {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

interface ClientRow {
  id: number;
  name: string;
  host: string;
  base: string;
}

async function loadClientMap(): Promise<ClientRow[]> {
  const r = await sql`SELECT id, name, website_url FROM clients WHERE website_url IS NOT NULL`;
  return r.rows
    .map((row) => {
      const host = urlHost(String(row.website_url ?? ''));
      if (!host) return null;
      return {
        id: row.id as number,
        name: row.name as string,
        host,
        base: registrableDomain(host),
      };
    })
    .filter((x): x is ClientRow => x !== null);
}

function attributeClient(recipientDomains: string[], clients: ClientRow[]): number | null {
  for (const dom of recipientDomains) {
    const match = clients.find((c) => c.host === dom);
    if (match) return match.id;
  }
  for (const dom of recipientDomains) {
    const base = registrableDomain(dom);
    const match = clients.find((c) => c.base === base);
    if (match) return match.id;
  }
  return null;
}

interface SyncOptions {
  afterEpochSec?: number;
  maxMessages?: number;
}

interface SyncResult {
  scanned: number;
  inserted: number;
  skipped: number;
  errors: number;
  windowStart: string;
  windowEnd: string;
}

async function getCursorEpoch(fallbackDays: number): Promise<number> {
  const r = await sql`
    SELECT MAX(comm_date) AS latest
    FROM jacque_comms
    WHERE filename LIKE 'gmail:%'
  `;
  const latest = r.rows[0]?.latest as Date | null;
  if (latest) {
    return Math.floor(latest.getTime() / 1000) - 3600;
  }
  return Math.floor(Date.now() / 1000) - fallbackDays * 86400;
}

async function alreadyStored(filename: string): Promise<boolean> {
  const r = await sql`SELECT 1 FROM jacque_comms WHERE filename = ${filename} LIMIT 1`;
  return r.rows.length > 0;
}

async function upsertEmail(params: {
  filename: string;
  clientId: number | null;
  content: string;
  commDate: Date;
  contentHash: string;
}): Promise<void> {
  await sql`
    INSERT INTO jacque_comms (filename, client_id, content, comm_date, file_mtime, content_hash)
    VALUES (
      ${params.filename},
      ${params.clientId},
      ${params.content},
      ${params.commDate.toISOString()},
      ${params.commDate.toISOString()},
      ${params.contentHash}
    )
    ON CONFLICT (filename) DO UPDATE SET
      client_id = EXCLUDED.client_id,
      content = EXCLUDED.content,
      comm_date = EXCLUDED.comm_date,
      content_hash = EXCLUDED.content_hash
  `;
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export async function syncSentEmails(opts: SyncOptions = {}): Promise<SyncResult> {
  const fallbackDays = 1;
  const after = opts.afterEpochSec ?? (await getCursorEpoch(fallbackDays));
  const maxMessages = opts.maxMessages ?? 500;
  const clients = await loadClientMap();

  const result: SyncResult = {
    scanned: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
    windowStart: new Date(after * 1000).toISOString(),
    windowEnd: new Date().toISOString(),
  };

  const query = encodeURIComponent(`from:me after:${after}`);
  let pageToken: string | undefined;

  while (result.scanned < maxMessages) {
    const path = `/users/me/messages?q=${query}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const list = await gmailGet<GmailListResponse>(path);
    const items = list.messages ?? [];
    if (items.length === 0) break;

    for (const item of items) {
      if (result.scanned >= maxMessages) break;
      result.scanned += 1;
      const filename = `gmail:${item.id}`;

      try {
        if (await alreadyStored(filename)) {
          result.skipped += 1;
          continue;
        }

        const msg = await gmailGet<GmailMessage>(`/users/me/messages/${item.id}?format=full`);
        if (!msg.labelIds?.includes('SENT')) {
          result.skipped += 1;
          continue;
        }

        const subject = getHeader(msg.payload, 'Subject') || '(no subject)';
        const toLine = getHeader(msg.payload, 'To');
        const ccLine = getHeader(msg.payload, 'Cc');
        const dateLine = getHeader(msg.payload, 'Date');
        const fromLine = getHeader(msg.payload, 'From');

        if (!fromLine.toLowerCase().includes(USER_EMAIL.toLowerCase())) {
          result.skipped += 1;
          continue;
        }

        const rawBody = extractBody(msg.payload);
        const cleaned = cleanBody(rawBody);
        if (cleaned.length < 40) {
          result.skipped += 1;
          continue;
        }

        const recipients = [...extractDomains(toLine), ...extractDomains(ccLine)].filter(
          (d) => d !== 'capconvert.com'
        );
        const clientId = attributeClient(recipients, clients);

        const commDate = msg.internalDate
          ? new Date(parseInt(msg.internalDate, 10))
          : new Date();

        const headerBlock = [
          toLine ? `To: ${toLine}` : null,
          ccLine ? `Cc: ${ccLine}` : null,
          `Subject: ${subject}`,
          dateLine ? `Date: ${dateLine}` : null,
        ]
          .filter(Boolean)
          .join('\n');

        const content = `${headerBlock}\n\n${cleaned}`;
        const hash = sha256(content);

        await upsertEmail({
          filename,
          clientId,
          content,
          commDate,
          contentHash: hash,
        });
        result.inserted += 1;
      } catch (err) {
        console.error('[gmail-sync] message error', item.id, err);
        result.errors += 1;
      }
    }

    pageToken = list.nextPageToken;
    if (!pageToken) break;
  }

  return result;
}
