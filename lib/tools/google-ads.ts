import type { ToolDefinition } from './types';

const ADS_API_VERSION = 'v22';
const ADS_API_BASE = `https://googleads.googleapis.com/${ADS_API_VERSION}`;

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
  const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google Ads OAuth env vars not set (GOOGLE_ADS_OAUTH_CLIENT_ID, GOOGLE_ADS_OAUTH_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN)');
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
    throw new Error(`Google Ads token refresh ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { value: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

interface AdsRow {
  campaign?: { id?: string; name?: string; advertisingChannelType?: string; status?: string };
  metrics?: Record<string, unknown>;
  segments?: Record<string, unknown>;
  searchTermView?: { searchTerm?: string };
  keyword?: { text?: string; matchType?: string };
  adGroupCriterion?: { keyword?: { text?: string; matchType?: string }; criterionId?: string };
  adGroup?: { id?: string; name?: string };
}

interface SearchResponse {
  results?: AdsRow[];
  fieldMask?: string;
}

async function adsSearch(customerId: string, query: string): Promise<AdsRow[]> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN env var is not set');
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

  const token = await getAccessToken();
  const cleanCustomer = customerId.replace(/-/g, '');
  const url = `${ADS_API_BASE}/customers/${cleanCustomer}/googleAds:search`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': devToken,
    'Content-Type': 'application/json',
  };
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId.replace(/-/g, '');

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Google Ads search ${res.status}: ${(await res.text()).slice(0, 600)}`);
  }
  const json = (await res.json()) as SearchResponse;
  return json.results || [];
}

function microsToUSD(micros: unknown): number | null {
  if (typeof micros !== 'string' && typeof micros !== 'number') return null;
  const n = typeof micros === 'string' ? Number(micros) : micros;
  if (!Number.isFinite(n)) return null;
  return Math.round((n / 1_000_000) * 100) / 100;
}

function num(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function pickCustomerId(input: Record<string, unknown>, ctxId: string | null): string {
  const provided = typeof input.customer_id === 'string' && input.customer_id.trim() ? input.customer_id.trim() : null;
  if (provided) return provided;
  if (!ctxId) throw new Error('No customer_id provided and no client google_ads_customer_id on file');
  return ctxId;
}

export const googleAdsAccountMetrics: ToolDefinition = {
  spec: {
    name: 'google_ads_account_metrics',
    description:
      "Get top-line Google Ads metrics for a client account: total spend (USD), conversions, CPA, ROAS, clicks, impressions, CTR, conversion rate, average CPC, conversion value. Use this for 'how is the Google Ads account performing' questions or to verify claimed numbers like CPA or spend. Defaults to the current client's google_ads_customer_id.",
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to 28 days ago.' },
        end_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' },
        customer_id: { type: 'string', description: 'Override Google Ads customer ID (10-digit, dashes optional). Defaults to current client.' },
      },
    },
  },
  handler: async (input, ctx) => {
    const customerId = pickCustomerId(input, ctx?.googleAdsCustomerId ?? null);
    const start = (input.start_date as string) || daysAgoISO(28);
    const end = (input.end_date as string) || todayISO();
    const query = `
      SELECT
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.cost_per_conversion,
        metrics.clicks,
        metrics.impressions,
        metrics.ctr,
        metrics.average_cpc,
        metrics.value_per_conversion
      FROM customer
      WHERE segments.date BETWEEN '${start}' AND '${end}'
    `.trim();
    const rows = await adsSearch(customerId, query);
    let cost_micros = 0, conversions = 0, conv_value_micros = 0, clicks = 0, impressions = 0;
    for (const r of rows) {
      const m = r.metrics || {};
      cost_micros += Number(m.costMicros) || 0;
      conversions += Number(m.conversions) || 0;
      conv_value_micros += Number(m.conversionsValue) || 0;
      clicks += Number(m.clicks) || 0;
      impressions += Number(m.impressions) || 0;
    }
    const spend_usd = Math.round((cost_micros / 1_000_000) * 100) / 100;
    const conv_value_usd = Math.round((conv_value_micros / 1_000_000) * 100) / 100;
    const cpa = conversions > 0 ? Math.round((spend_usd / conversions) * 100) / 100 : null;
    const roas = spend_usd > 0 ? Math.round((conv_value_usd / spend_usd) * 100) / 100 : null;
    const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : null;
    const cpc = clicks > 0 ? Math.round((spend_usd / clicks) * 100) / 100 : null;
    const conv_rate = clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : null;
    return {
      customer_id: customerId,
      date_range: { start, end },
      spend_usd,
      conversions: Math.round(conversions * 100) / 100,
      cpa_usd: cpa,
      conversions_value_usd: conv_value_usd,
      roas,
      clicks,
      impressions,
      ctr_pct: ctr,
      avg_cpc_usd: cpc,
      conv_rate_pct: conv_rate,
    };
  },
};

export const googleAdsCampaignPerformance: ToolDefinition = {
  spec: {
    name: 'google_ads_campaign_performance',
    description:
      "Get per-campaign Google Ads performance for a client account: campaign name, type (Search/PMax/Shopping/Display/etc.), status, spend, conversions, CPA, clicks, impressions. Use for 'which campaigns are spending the most' or 'how is PMax performing vs Search' questions. Defaults to last 28 days, top 50 by spend.",
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to 28 days ago.' },
        end_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' },
        limit: { type: 'integer', description: 'Number of campaigns. Default 50, max 200.' },
        customer_id: { type: 'string', description: 'Override Google Ads customer ID. Defaults to current client.' },
      },
    },
  },
  handler: async (input, ctx) => {
    const customerId = pickCustomerId(input, ctx?.googleAdsCustomerId ?? null);
    const start = (input.start_date as string) || daysAgoISO(28);
    const end = (input.end_date as string) || todayISO();
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.advertising_channel_type,
        campaign.status,
        metrics.cost_micros,
        metrics.conversions,
        metrics.cost_per_conversion,
        metrics.clicks,
        metrics.impressions,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${start}' AND '${end}'
      ORDER BY metrics.cost_micros DESC
      LIMIT ${limit}
    `.trim();
    const rows = await adsSearch(customerId, query);
    return {
      customer_id: customerId,
      date_range: { start, end },
      campaigns: rows.map((r) => {
        const m = r.metrics || {};
        const c = r.campaign || {};
        const cost = microsToUSD(m.costMicros);
        const convs = num(m.conversions);
        const conv_value = microsToUSD(m.conversionsValue);
        return {
          id: c.id,
          name: c.name,
          channel_type: c.advertisingChannelType,
          status: c.status,
          spend_usd: cost,
          conversions: convs,
          cpa_usd: cost && convs && convs > 0 ? Math.round((cost / convs) * 100) / 100 : null,
          conv_value_usd: conv_value,
          roas: cost && conv_value && cost > 0 ? Math.round((conv_value / cost) * 100) / 100 : null,
          clicks: num(m.clicks),
          impressions: num(m.impressions),
        };
      }),
    };
  },
};

export const googleAdsTopSearchTerms: ToolDefinition = {
  spec: {
    name: 'google_ads_top_search_terms',
    description:
      "Get top search terms users actually typed when triggering Google Ads, ranked by cost. Returns search term, the campaign that triggered, spend, conversions, clicks, impressions. Use for 'what are we paying for' or 'what queries are wasting budget' questions. Defaults to last 28 days, top 100 terms.",
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to 28 days ago.' },
        end_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' },
        limit: { type: 'integer', description: 'Number of terms. Default 100, max 500.' },
        customer_id: { type: 'string', description: 'Override Google Ads customer ID. Defaults to current client.' },
      },
    },
  },
  handler: async (input, ctx) => {
    const customerId = pickCustomerId(input, ctx?.googleAdsCustomerId ?? null);
    const start = (input.start_date as string) || daysAgoISO(28);
    const end = (input.end_date as string) || todayISO();
    const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 500);
    const query = `
      SELECT
        search_term_view.search_term,
        campaign.name,
        metrics.cost_micros,
        metrics.conversions,
        metrics.clicks,
        metrics.impressions
      FROM search_term_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
      ORDER BY metrics.cost_micros DESC
      LIMIT ${limit}
    `.trim();
    const rows = await adsSearch(customerId, query);
    return {
      customer_id: customerId,
      date_range: { start, end },
      search_terms: rows.map((r) => {
        const m = r.metrics || {};
        const cost = microsToUSD(m.costMicros);
        const convs = num(m.conversions);
        return {
          search_term: r.searchTermView?.searchTerm,
          campaign: r.campaign?.name,
          spend_usd: cost,
          conversions: convs,
          cpa_usd: cost && convs && convs > 0 ? Math.round((cost / convs) * 100) / 100 : null,
          clicks: num(m.clicks),
          impressions: num(m.impressions),
        };
      }),
    };
  },
};

export const googleAdsKeywordPerformance: ToolDefinition = {
  spec: {
    name: 'google_ads_keyword_performance',
    description:
      "Get keyword-level Google Ads performance: keyword text, match type, ad group, spend, conversions, CPA, clicks, impressions, average CPC. Use for 'which keywords convert' or 'which keywords are wasting spend' questions. Defaults to last 28 days, top 100 by spend.",
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to 28 days ago.' },
        end_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' },
        limit: { type: 'integer', description: 'Number of keywords. Default 100, max 500.' },
        customer_id: { type: 'string', description: 'Override Google Ads customer ID. Defaults to current client.' },
      },
    },
  },
  handler: async (input, ctx) => {
    const customerId = pickCustomerId(input, ctx?.googleAdsCustomerId ?? null);
    const start = (input.start_date as string) || daysAgoISO(28);
    const end = (input.end_date as string) || todayISO();
    const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 500);
    const query = `
      SELECT
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group.name,
        campaign.name,
        metrics.cost_micros,
        metrics.conversions,
        metrics.clicks,
        metrics.impressions,
        metrics.average_cpc
      FROM keyword_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
      ORDER BY metrics.cost_micros DESC
      LIMIT ${limit}
    `.trim();
    const rows = await adsSearch(customerId, query);
    return {
      customer_id: customerId,
      date_range: { start, end },
      keywords: rows.map((r) => {
        const m = r.metrics || {};
        const cost = microsToUSD(m.costMicros);
        const convs = num(m.conversions);
        const k = r.adGroupCriterion?.keyword;
        return {
          keyword: k?.text,
          match_type: k?.matchType,
          ad_group: r.adGroup?.name,
          campaign: r.campaign?.name,
          spend_usd: cost,
          conversions: convs,
          cpa_usd: cost && convs && convs > 0 ? Math.round((cost / convs) * 100) / 100 : null,
          clicks: num(m.clicks),
          impressions: num(m.impressions),
          avg_cpc_usd: microsToUSD(m.averageCpc),
        };
      }),
    };
  },
};

export const googleAdsToolDefinitions: ToolDefinition[] = [
  googleAdsAccountMetrics,
  googleAdsCampaignPerformance,
  googleAdsTopSearchTerms,
  googleAdsKeywordPerformance,
];
