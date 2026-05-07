import type { ToolDefinition } from './types';

const PSI_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

interface PsiAuditDef { id: string; score: number | null; numericValue?: number | null; numericUnit?: string; displayValue?: string | null; title?: string }

interface PsiCategoryRef { id: string; weight: number }
interface PsiCategory { id: string; title: string; score: number | null; auditRefs?: PsiCategoryRef[] }

interface LighthouseResult {
  categories?: Record<string, PsiCategory>;
  audits?: Record<string, PsiAuditDef>;
  configSettings?: { formFactor?: string };
  fetchTime?: string;
  finalUrl?: string;
  requestedUrl?: string;
}

interface PsiRoot {
  id?: string;
  loadingExperience?: PsiExperience;
  originLoadingExperience?: PsiExperience;
  lighthouseResult?: LighthouseResult;
  error?: { message?: string };
}

interface PsiMetric { percentile?: number; category?: string; distributions?: Array<{ min: number; max?: number; proportion: number }> }
interface PsiExperience {
  metrics?: Record<string, PsiMetric>;
  overall_category?: string;
  initial_url?: string;
  origin_fallback?: boolean;
}

function normalizeUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function pickAudit(audits: Record<string, PsiAuditDef> | undefined, id: string) {
  const a = audits?.[id];
  if (!a) return null;
  return {
    score: a.score,
    value: a.numericValue ?? null,
    unit: a.numericUnit || null,
    display: a.displayValue || null,
  };
}

function fieldFrom(metrics: Record<string, PsiMetric> | undefined, key: string) {
  const m = metrics?.[key];
  if (!m) return null;
  return { p75: m.percentile ?? null, category: m.category || null };
}

export const pagespeedAudit: ToolDefinition = {
  spec: {
    name: 'pagespeed_audit',
    description:
      "Run a Google PageSpeed Insights audit on a URL and return both lab scores (Lighthouse: performance, SEO, accessibility, best-practices) and field metrics (real Chrome user p75 LCP, INP, CLS, FCP, TTFB) plus a Core Web Vitals pass/fail. Use for any 'is this page fast', 'does it pass Core Web Vitals', 'why is the perf score low', or 'compare mobile vs desktop' question. Field metrics come from real users (CrUX) - prefer these over lab numbers when both are present.",
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to audit. Required.' },
        strategy: { type: 'string', enum: ['mobile', 'desktop'], description: 'Mobile or desktop. Default mobile.' },
        category: {
          type: 'array',
          items: { type: 'string', enum: ['performance', 'accessibility', 'best-practices', 'seo'] },
          description: 'Categories to score. Default all four.',
        },
      },
      required: ['url'],
    },
  },
  handler: async (input) => {
    const raw = (input.url as string)?.trim();
    if (!raw) return { error: 'url is required' };
    const url = normalizeUrl(raw);
    const strategy = (input.strategy as string) === 'desktop' ? 'desktop' : 'mobile';
    const cats = Array.isArray(input.category) && input.category.length
      ? (input.category as string[])
      : ['performance', 'accessibility', 'best-practices', 'seo'];

    const params = new URLSearchParams();
    params.append('url', url);
    params.append('strategy', strategy);
    for (const c of cats) params.append('category', c);
    const apiKey = process.env.PAGESPEED_API_KEY || process.env.GOOGLE_PAGESPEED_API_KEY;
    if (apiKey) params.append('key', apiKey);

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    let res: Response;
    try {
      res = await fetch(`${PSI_BASE}?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      return { url, strategy, error: err instanceof Error ? err.message : String(err), elapsed_ms: Date.now() - start };
    }
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      return { url, strategy, status: res.status, error: body.slice(0, 500), elapsed_ms: Date.now() - start };
    }
    const data = (await res.json()) as PsiRoot;
    const lh = data.lighthouseResult || {};
    const cat = lh.categories || {};
    const audits = lh.audits || {};

    const fieldSrc = data.loadingExperience?.metrics ? data.loadingExperience : data.originLoadingExperience;
    const fieldMetrics = fieldSrc?.metrics;
    const field = {
      data_source: data.loadingExperience?.metrics ? 'page' : (data.originLoadingExperience?.metrics ? 'origin_fallback' : 'none'),
      overall: fieldSrc?.overall_category || null,
      lcp: fieldFrom(fieldMetrics, 'LARGEST_CONTENTFUL_PAINT_MS'),
      inp: fieldFrom(fieldMetrics, 'INTERACTION_TO_NEXT_PAINT'),
      cls: fieldFrom(fieldMetrics, 'CUMULATIVE_LAYOUT_SHIFT_SCORE'),
      fcp: fieldFrom(fieldMetrics, 'FIRST_CONTENTFUL_PAINT_MS'),
      ttfb: fieldFrom(fieldMetrics, 'EXPERIMENTAL_TIME_TO_FIRST_BYTE'),
    };

    function pass(metric: { p75: number | null; category: string | null } | null, threshold: number): boolean | null {
      if (!metric || metric.p75 == null) return null;
      return metric.p75 <= threshold;
    }
    const cwv_pass_components = {
      lcp: pass(field.lcp, 2500),
      inp: pass(field.inp, 200),
      cls: field.cls?.p75 != null ? field.cls.p75 <= 0.1 : null,
    };
    const cwv_pass = Object.values(cwv_pass_components).every((v) => v === true)
      && Object.values(cwv_pass_components).some((v) => v !== null);

    const lab = {
      performance: cat.performance?.score ?? null,
      seo: cat.seo?.score ?? null,
      accessibility: cat.accessibility?.score ?? null,
      best_practices: cat['best-practices']?.score ?? null,
      lcp: pickAudit(audits, 'largest-contentful-paint'),
      fcp: pickAudit(audits, 'first-contentful-paint'),
      cls: pickAudit(audits, 'cumulative-layout-shift'),
      tbt: pickAudit(audits, 'total-blocking-time'),
      ttfb: pickAudit(audits, 'server-response-time'),
      speed_index: pickAudit(audits, 'speed-index'),
      tti: pickAudit(audits, 'interactive'),
    };

    const opportunities: Array<{ id: string; display: string | null; savings_ms: number | null }> = [];
    const perfCat = cat.performance;
    if (perfCat?.auditRefs) {
      for (const ref of perfCat.auditRefs) {
        const a = audits[ref.id];
        if (!a || a.score === null || a.score === 1) continue;
        if (a.numericUnit === 'millisecond' && (a.numericValue ?? 0) > 0) {
          opportunities.push({ id: ref.id, display: a.title || ref.id, savings_ms: a.numericValue ?? null });
        }
      }
      opportunities.sort((a, b) => (b.savings_ms ?? 0) - (a.savings_ms ?? 0));
    }

    return {
      url,
      final_url: lh.finalUrl || url,
      strategy,
      fetched_at: lh.fetchTime || new Date().toISOString(),
      elapsed_ms: Date.now() - start,
      lab,
      field,
      cwv_pass,
      cwv_pass_components,
      top_opportunities: opportunities.slice(0, 8),
    };
  },
};

export const pagespeedToolDefinitions: ToolDefinition[] = [pagespeedAudit];
