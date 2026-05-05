import crypto from 'node:crypto';
import type { ToolDefinition } from './types';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function loadServiceAccount(): ServiceAccount {
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GA4_SERVICE_ACCOUNT_JSON env var is not set');
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('GA4_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GA4_SERVICE_ACCOUNT_JSON missing client_email or private_key');
  }
  return parsed;
}

function base64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf;
  return b.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const sa = loadServiceAccount();
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = base64url(signer.sign(sa.private_key.replace(/\\n/g, '\n')));
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`GA4 token exchange ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

interface GA4ReportRow {
  dimensionValues?: Array<{ value: string }>;
  metricValues?: Array<{ value: string }>;
}

interface GA4ReportResponse {
  dimensionHeaders?: Array<{ name: string }>;
  metricHeaders?: Array<{ name: string; type: string }>;
  rows?: GA4ReportRow[];
  rowCount?: number;
  totals?: GA4ReportRow[];
}

async function runReport(propertyId: string, body: Record<string, unknown>): Promise<GA4ReportResponse> {
  const token = await getAccessToken();
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GA4 runReport ${res.status}: ${(await res.text()).slice(0, 600)}`);
  }
  return (await res.json()) as GA4ReportResponse;
}

function flattenRows(resp: GA4ReportResponse): Array<Record<string, string>> {
  const dims = resp.dimensionHeaders?.map((h) => h.name) || [];
  const mets = resp.metricHeaders?.map((h) => h.name) || [];
  return (resp.rows || []).map((row) => {
    const out: Record<string, string> = {};
    dims.forEach((d, i) => {
      out[d] = row.dimensionValues?.[i]?.value ?? '';
    });
    mets.forEach((m, i) => {
      out[m] = row.metricValues?.[i]?.value ?? '';
    });
    return out;
  });
}

export const ga4RunReport: ToolDefinition = {
  spec: {
    name: 'ga4_run_report',
    description:
      "Run a Google Analytics 4 report against the client's GA4 property. Returns rows with the requested metrics and dimensions. Use this for traffic, conversions, revenue, landing-page performance, channel/source breakdowns, and any other GA4 question. Requires the client to have a GA4 property ID set; if not, this will fail and you should say so.\n\nCommon metrics: sessions, totalUsers, activeUsers, screenPageViews, engagedSessions, engagementRate, bounceRate, averageSessionDuration, conversions, totalRevenue, purchaseRevenue, eventCount.\nCommon dimensions: pagePath, pageTitle, landingPage, sessionDefaultChannelGroup, sessionSource, sessionMedium, sessionCampaignName, country, deviceCategory, eventName, date.\nDate ranges accept GA4 shorthand like today, yesterday, 7daysAgo, 28daysAgo, 90daysAgo, or ISO YYYY-MM-DD.",
    input_schema: {
      type: 'object',
      properties: {
        metrics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Metric names (e.g. ["sessions", "conversions"])',
        },
        dimensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Dimension names (e.g. ["landingPage", "sessionDefaultChannelGroup"]). Optional.',
        },
        start_date: { type: 'string', description: 'Start date. GA4 shorthand or YYYY-MM-DD. Defaults to 28daysAgo.' },
        end_date: { type: 'string', description: 'End date. Defaults to today.' },
        order_by_metric: { type: 'string', description: 'Metric name to sort descending. Optional.' },
        limit: { type: 'integer', description: 'Max rows. Default 25, max 250.' },
        property_id: { type: 'string', description: 'Override GA4 property ID. Defaults to current client.' },
      },
      required: ['metrics'],
    },
  },
  handler: async (input, ctx) => {
    const propertyId = (input.property_id as string) || ctx?.ga4PropertyId || null;
    if (!propertyId) {
      return {
        error: `No GA4 property ID configured for client "${ctx?.clientName ?? 'unknown'}". Set the ga4_property_id field on the client (or pass property_id) to enable GA4 tools.`,
      };
    }
    const metrics = (input.metrics as string[] | undefined) || [];
    if (!metrics.length) return { error: 'metrics is required and cannot be empty' };
    const dimensions = (input.dimensions as string[] | undefined) || [];
    const start_date = (input.start_date as string) || '28daysAgo';
    const end_date = (input.end_date as string) || 'today';
    const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 250);
    const order_by_metric = input.order_by_metric as string | undefined;

    const body: Record<string, unknown> = {
      dateRanges: [{ startDate: start_date, endDate: end_date }],
      metrics: metrics.map((name) => ({ name })),
      limit,
    };
    if (dimensions.length) body.dimensions = dimensions.map((name) => ({ name }));
    if (order_by_metric) body.orderBys = [{ metric: { metricName: order_by_metric }, desc: true }];

    const resp = await runReport(propertyId, body);
    return {
      property_id: propertyId,
      date_range: { start_date, end_date },
      row_count: resp.rowCount ?? (resp.rows?.length ?? 0),
      rows: flattenRows(resp),
    };
  },
};

export const ga4ToolDefinitions: ToolDefinition[] = [ga4RunReport];
