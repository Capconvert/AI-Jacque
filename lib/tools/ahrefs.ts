import type { ToolDefinition } from './types';

const AHREFS_BASE = 'https://api.ahrefs.com/v3';

function token(): string {
  const t = process.env.AHREFS_API_TOKEN;
  if (!t) throw new Error('AHREFS_API_TOKEN env var is not set');
  return t;
}

async function ahrefsGet<T = unknown>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
  }
  const url = `${AHREFS_BASE}${path}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ahrefs ${path} ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function hostname(url: string): string {
  return url.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
}

function pickTarget(input: Record<string, unknown>, websiteUrl: string | undefined): string {
  const provided = typeof input.target === 'string' && input.target.trim() ? input.target.trim() : null;
  if (provided) return provided;
  if (!websiteUrl) throw new Error('No target provided and no client website on file');
  return hostname(websiteUrl);
}

export const ahrefsSiteMetrics: ToolDefinition = {
  spec: {
    name: 'ahrefs_site_metrics',
    description:
      'Get top-line Ahrefs metrics for a domain: organic traffic, total organic keywords, paid traffic, paid keyword count, total traffic value (USD cents). Use this for a high-level "how is the site doing organically" snapshot. Defaults to the current client domain.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Domain or URL to analyze (e.g. example.com). Defaults to current client.' },
        country: { type: 'string', description: 'Two-letter ISO country code to filter (e.g. US). Optional - omit for global.' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD. Defaults to today.' },
      },
    },
  },
  handler: async (input, ctx) => {
    const target = pickTarget(input, ctx?.websiteUrl);
    const date = (input.date as string) || todayISO();
    const country = input.country as string | undefined;
    const data = await ahrefsGet<{ metrics: Record<string, number | null> }>(`/site-explorer/metrics`, {
      target,
      date,
      country,
      mode: 'subdomains',
      protocol: 'both',
      output: 'json',
    });
    const m = data.metrics || {};
    return {
      target,
      date,
      country: country || 'global',
      organic_traffic_monthly: m.org_traffic ?? null,
      organic_keywords_total: m.org_keywords ?? null,
      organic_keywords_top3: m.org_keywords_1_3 ?? null,
      paid_traffic_monthly: m.paid_traffic ?? null,
      paid_keywords: m.paid_keywords ?? null,
      organic_traffic_value_usd: m.org_cost != null ? Math.round(m.org_cost / 100) : null,
      paid_traffic_value_usd: m.paid_cost != null ? Math.round(m.paid_cost / 100) : null,
    };
  },
};

export const ahrefsTopKeywords: ToolDefinition = {
  spec: {
    name: 'ahrefs_top_keywords',
    description:
      'Get the top organic keywords a domain ranks for, ordered by traffic. Returns keyword, position, search volume, KD, and estimated monthly traffic. Use for "what is this site ranking for" or "which keywords drive the most traffic" questions. Defaults to the current client domain.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Domain or URL. Defaults to current client.' },
        country: { type: 'string', description: 'Two-letter ISO country code (e.g. US). Optional.' },
        limit: { type: 'integer', description: 'Number of keywords to return. Default 25, max 100.' },
        date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' },
      },
    },
  },
  handler: async (input, ctx) => {
    const target = pickTarget(input, ctx?.websiteUrl);
    const date = (input.date as string) || todayISO();
    const country = input.country as string | undefined;
    const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 100);
    const data = await ahrefsGet<{ keywords: Array<Record<string, unknown>> }>(`/site-explorer/organic-keywords`, {
      target,
      date,
      country,
      limit,
      mode: 'subdomains',
      protocol: 'both',
      select: 'keyword,best_position,volume,keyword_difficulty,sum_traffic,best_position_url,is_branded',
      order_by: 'sum_traffic:desc',
      output: 'json',
    });
    return {
      target,
      date,
      country: country || 'global',
      keywords: (data.keywords || []).map((k) => ({
        keyword: k.keyword,
        position: k.best_position,
        volume: k.volume,
        keyword_difficulty: k.keyword_difficulty,
        traffic_estimate: k.sum_traffic,
        url: k.best_position_url,
        is_branded: k.is_branded,
      })),
    };
  },
};

export const ahrefsTopPages: ToolDefinition = {
  spec: {
    name: 'ahrefs_top_pages',
    description:
      'Get the top pages on a domain by estimated organic search traffic. Returns URL, traffic estimate, top keyword, total keywords ranking, traffic value, and recent traffic change. Use for "what pages drive the most traffic" or "which pages dropped" questions. Defaults to the current client domain.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Domain or URL. Defaults to current client.' },
        country: { type: 'string', description: 'Two-letter ISO country code. Optional.' },
        limit: { type: 'integer', description: 'Number of pages to return. Default 25, max 100.' },
        date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' },
        date_compared: { type: 'string', description: 'YYYY-MM-DD comparison date for traffic_diff. Defaults to 30 days ago.' },
      },
    },
  },
  handler: async (input, ctx) => {
    const target = pickTarget(input, ctx?.websiteUrl);
    const date = (input.date as string) || todayISO();
    const date_compared = (input.date_compared as string) || daysAgoISO(30);
    const country = input.country as string | undefined;
    const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 100);
    const data = await ahrefsGet<{ pages: Array<Record<string, unknown>> }>(`/site-explorer/top-pages`, {
      target,
      date,
      date_compared,
      country,
      limit,
      mode: 'subdomains',
      protocol: 'both',
      select: 'url,sum_traffic,sum_traffic_prev,traffic_diff,traffic_diff_percent,top_keyword,keywords,value,ur',
      order_by: 'sum_traffic:desc',
      output: 'json',
    });
    return {
      target,
      date,
      date_compared,
      country: country || 'global',
      pages: (data.pages || []).map((p) => ({
        url: p.url,
        traffic_estimate: p.sum_traffic,
        traffic_estimate_prev: p.sum_traffic_prev,
        traffic_change: p.traffic_diff,
        traffic_change_pct: p.traffic_diff_percent,
        top_keyword: p.top_keyword,
        keywords_ranking: p.keywords,
        traffic_value_usd: typeof p.value === 'number' ? Math.round((p.value as number) / 100) : null,
        url_rating: p.ur,
      })),
    };
  },
};

export const gscTopPages: ToolDefinition = {
  spec: {
    name: 'gsc_top_pages',
    description:
      "Get top pages from Google Search Console for the client's site - actual Google clicks, impressions, CTR, average position. Real GSC data, not Ahrefs estimates. Requires the client to have an Ahrefs project ID set up; if not, this will fail and you should say so.",
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Start date YYYY-MM-DD. Defaults to 28 days ago.' },
        date_to: { type: 'string', description: 'End date YYYY-MM-DD. Defaults to today.' },
        country: { type: 'string', description: 'Two-letter ISO country code. Optional.' },
        device: { type: 'string', enum: ['desktop', 'mobile', 'tablet'], description: 'Filter by device. Optional.' },
        limit: { type: 'integer', description: 'Number of pages. Default 25, max 100.' },
      },
    },
  },
  handler: async (input, ctx) => {
    if (!ctx?.ahrefsProjectId) {
      return {
        error: `No Ahrefs project ID configured for client "${ctx?.clientName ?? 'unknown'}". Set the ahrefs_project_id field on the client to enable GSC tools.`,
      };
    }
    const date_from = (input.date_from as string) || daysAgoISO(28);
    const date_to = (input.date_to as string) || todayISO();
    const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 100);
    const data = await ahrefsGet<{ pages: Array<Record<string, unknown>> }>(`/gsc/pages`, {
      project_id: ctx.ahrefsProjectId,
      date_from,
      date_to,
      country: input.country as string | undefined,
      device: input.device as string | undefined,
      limit,
      output: 'json',
    });
    return {
      date_from,
      date_to,
      pages: (data.pages || []).map((p) => ({
        page: p.page,
        clicks: p.clicks,
        impressions: p.impressions,
        ctr: p.ctr,
        avg_position: p.position,
        top_keyword: p.top_keyword,
        keywords_count: p.keywords_count,
      })),
    };
  },
};

export const gscTopQueries: ToolDefinition = {
  spec: {
    name: 'gsc_top_queries',
    description:
      "Get top search queries from Google Search Console for the client's site - actual queries Google users searched, with clicks/impressions/CTR/avg position. Real GSC data. Requires the client to have an Ahrefs project ID set up.",
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Start YYYY-MM-DD. Defaults to 28 days ago.' },
        date_to: { type: 'string', description: 'End YYYY-MM-DD. Defaults to today.' },
        country: { type: 'string', description: 'Two-letter ISO country code. Optional.' },
        device: { type: 'string', enum: ['desktop', 'mobile', 'tablet'], description: 'Filter by device. Optional.' },
        limit: { type: 'integer', description: 'Number of queries. Default 50, max 200.' },
      },
    },
  },
  handler: async (input, ctx) => {
    if (!ctx?.ahrefsProjectId) {
      return {
        error: `No Ahrefs project ID configured for client "${ctx?.clientName ?? 'unknown'}". Set the ahrefs_project_id field on the client to enable GSC tools.`,
      };
    }
    const date_from = (input.date_from as string) || daysAgoISO(28);
    const date_to = (input.date_to as string) || todayISO();
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
    const data = await ahrefsGet<{ keywords: Array<Record<string, unknown>> }>(`/gsc/keywords`, {
      project_id: ctx.ahrefsProjectId,
      date_from,
      date_to,
      country: input.country as string | undefined,
      device: input.device as string | undefined,
      limit,
      output: 'json',
    });
    return {
      date_from,
      date_to,
      queries: (data.keywords || []).map((k) => ({
        query: k.keyword,
        clicks: k.clicks,
        impressions: k.impressions,
        ctr: k.ctr,
        avg_position: k.position,
      })),
    };
  },
};

export const ahrefsToolDefinitions: ToolDefinition[] = [
  ahrefsSiteMetrics,
  ahrefsTopKeywords,
  ahrefsTopPages,
  gscTopPages,
  gscTopQueries,
];
