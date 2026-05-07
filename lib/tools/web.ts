import { load, type CheerioAPI } from 'cheerio';
import type { ToolDefinition } from './types';

const DEFAULT_UA =
  'Mozilla/5.0 (compatible; AIJacqueBot/1.0; +https://jacque.bot/) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const GOOGLEBOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const FETCH_TIMEOUT_MS = 15000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_HEAD_HTML = 30_000;
const MAX_RAW_EXCERPT = 60_000;

function pickUserAgent(input: Record<string, unknown>): string {
  const ua = (input.user_agent as string | undefined)?.trim();
  if (!ua) return DEFAULT_UA;
  if (ua.toLowerCase() === 'googlebot') return GOOGLEBOT_UA;
  if (ua.toLowerCase() === 'default' || ua.toLowerCase() === 'browser') return DEFAULT_UA;
  return ua;
}

function normalizeUrl(raw: string, base?: string): string {
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (base) {
    try {
      return new URL(raw, base).toString();
    } catch {
      return raw;
    }
  }
  return `https://${raw}`;
}

interface FetchResult {
  url: string;
  final_url: string;
  status: number;
  ok: boolean;
  redirects: number;
  elapsed_ms: number;
  size_bytes: number;
  content_type: string | null;
  body: string;
  error?: string;
}

async function fetchWithLimits(
  url: string,
  opts: { ua: string; method?: 'GET' | 'HEAD'; maxBytes?: number } = { ua: DEFAULT_UA }
): Promise<FetchResult> {
  const start = Date.now();
  const target = normalizeUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      method: opts.method ?? 'GET',
      headers: {
        'User-Agent': opts.ua,
        Accept: 'text/html,application/xhtml+xml,application/xml,application/json,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    const final_url = res.url;
    const redirects = final_url !== target ? 1 : 0;
    const content_type = res.headers.get('content-type');
    const max = opts.maxBytes ?? MAX_RESPONSE_BYTES;

    let body = '';
    if (opts.method !== 'HEAD') {
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder('utf-8', { fatal: false });
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > max) {
            body += decoder.decode(value.subarray(0, Math.max(0, value.byteLength - (received - max))));
            try { await reader.cancel(); } catch { /* ignore */ }
            break;
          }
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      } else {
        body = await res.text();
        if (body.length > max) body = body.slice(0, max);
      }
    }

    return {
      url: target,
      final_url,
      status: res.status,
      ok: res.ok,
      redirects,
      elapsed_ms: Date.now() - start,
      size_bytes: body.length,
      content_type,
      body,
    };
  } catch (err) {
    return {
      url: target,
      final_url: target,
      status: 0,
      ok: false,
      redirects: 0,
      elapsed_ms: Date.now() - start,
      size_bytes: 0,
      content_type: null,
      body: '',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

interface SeoSnapshot {
  title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  canonical: string | null;
  robots: string | null;
  viewport: string | null;
  charset: string | null;
  lang: string | null;
  h1: string[];
  h2: string[];
  h3: string[];
  og: Record<string, string>;
  twitter: Record<string, string>;
  hreflang: Array<{ hreflang: string; href: string }>;
  json_ld: unknown[];
  json_ld_raw_count: number;
  json_ld_parse_errors: number;
  links: { internal: number; external: number; nofollow: number; samples: string[] };
  images: { total: number; missing_alt: number };
  word_count: number;
}

function parseSeoSnapshot($: CheerioAPI, baseUrl: string): SeoSnapshot {
  const text = (sel: string) => $(sel).first().text().trim() || null;
  const attr = (sel: string, name: string) => $(sel).first().attr(name) || null;

  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const k = $(el).attr('property')?.replace(/^og:/, '');
    const v = $(el).attr('content');
    if (k && v) og[k] = v;
  });
  const twitter: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const k = $(el).attr('name')?.replace(/^twitter:/, '');
    const v = $(el).attr('content');
    if (k && v) twitter[k] = v;
  });

  const hreflang: Array<{ hreflang: string; href: string }> = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr('hreflang');
    const href = $(el).attr('href');
    if (lang && href) hreflang.push({ hreflang: lang, href });
  });

  const json_ld: unknown[] = [];
  let json_ld_raw_count = 0;
  let json_ld_parse_errors = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    json_ld_raw_count += 1;
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        json_ld.push(...parsed);
      } else if (parsed && typeof parsed === 'object' && '@graph' in parsed && Array.isArray((parsed as { '@graph': unknown[] })['@graph'])) {
        json_ld.push(parsed);
      } else {
        json_ld.push(parsed);
      }
    } catch {
      json_ld_parse_errors += 1;
    }
  });

  let internal = 0;
  let external = 0;
  let nofollow = 0;
  const sampleSet: string[] = [];
  let baseHost = '';
  try { baseHost = new URL(baseUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const rel = ($(el).attr('rel') || '').toLowerCase();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    let abs: string;
    try { abs = new URL(href, baseUrl).toString(); } catch { return; }
    let host = '';
    try { host = new URL(abs).hostname.replace(/^www\./, ''); } catch { return; }
    if (host === baseHost) internal += 1; else external += 1;
    if (rel.includes('nofollow')) nofollow += 1;
    if (sampleSet.length < 10) sampleSet.push(abs);
  });

  let imgTotal = 0;
  let imgMissingAlt = 0;
  $('img').each((_, el) => {
    imgTotal += 1;
    const alt = $(el).attr('alt');
    if (alt === undefined) imgMissingAlt += 1;
  });

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;

  return {
    title: text('title'),
    meta_description: attr('meta[name="description"]', 'content'),
    meta_keywords: attr('meta[name="keywords"]', 'content'),
    canonical: attr('link[rel="canonical"]', 'href'),
    robots: attr('meta[name="robots"]', 'content'),
    viewport: attr('meta[name="viewport"]', 'content'),
    charset: $('meta[charset]').first().attr('charset') || null,
    lang: $('html').first().attr('lang') || null,
    h1: $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean),
    h2: $('h2').map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 30),
    h3: $('h3').map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 30),
    og,
    twitter,
    hreflang,
    json_ld,
    json_ld_raw_count,
    json_ld_parse_errors,
    links: { internal, external, nofollow, samples: sampleSet },
    images: { total: imgTotal, missing_alt: imgMissingAlt },
    word_count: wordCount,
  };
}

export const fetchPage: ToolDefinition = {
  spec: {
    name: 'fetch_page',
    description:
      "Fetch a URL and return both the parsed SEO snapshot and (optionally) raw HTML. Use this when the question is about what's actually in a page's HTML or schema: brand name in source, title vs h1 mismatch, og:site_name, JSON-LD types/values, canonical, hreflang, meta description, robots directives, structured data inspection. Returns: status, final_url after redirects, title, meta_description, canonical, h1/h2/h3, og:* tags, twitter:* tags, hreflang, parsed JSON-LD, link counts, word count, and the entire <head> HTML. Set include_raw_html=true to also get up to 60KB of raw body HTML for cases where you need to grep beyond the head. NEVER tell the user to open View Page Source themselves; call this tool instead.",
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL or domain (https://added if missing). Required.' },
        include_raw_html: {
          type: 'boolean',
          description: 'If true, also return up to 60KB of raw body HTML. Default false (head HTML is always returned).',
        },
        user_agent: {
          type: 'string',
          description: "User-Agent override. Pass 'googlebot' to mimic Google's crawler (useful when a site bot-blocks normal browsers). Default is a Chrome-like UA.",
        },
      },
      required: ['url'],
    },
  },
  handler: async (input) => {
    const url = (input.url as string)?.trim();
    if (!url) return { error: 'url is required' };
    const ua = pickUserAgent(input);
    const includeRaw = input.include_raw_html === true;
    const res = await fetchWithLimits(url, { ua });
    if (res.error) {
      return {
        url: res.url,
        status: res.status,
        error: res.error,
        elapsed_ms: res.elapsed_ms,
      };
    }
    if (!res.body) {
      return {
        url: res.url,
        final_url: res.final_url,
        status: res.status,
        content_type: res.content_type,
        elapsed_ms: res.elapsed_ms,
        size_bytes: res.size_bytes,
        note: 'Empty response body',
      };
    }

    const isHtml = (res.content_type || '').toLowerCase().includes('html') || /^\s*<(?:!doctype|html)/i.test(res.body);
    if (!isHtml) {
      return {
        url: res.url,
        final_url: res.final_url,
        status: res.status,
        content_type: res.content_type,
        elapsed_ms: res.elapsed_ms,
        size_bytes: res.size_bytes,
        body_excerpt: res.body.slice(0, MAX_RAW_EXCERPT),
        note: 'Non-HTML response - returning body excerpt only',
      };
    }

    const $ = load(res.body);
    const seo = parseSeoSnapshot($, res.final_url);
    const headHtml = ($.html('head') || '').slice(0, MAX_HEAD_HTML);

    return {
      url: res.url,
      final_url: res.final_url,
      status: res.status,
      ok: res.ok,
      content_type: res.content_type,
      elapsed_ms: res.elapsed_ms,
      size_bytes: res.size_bytes,
      ...seo,
      head_html: headHtml,
      raw_html_excerpt: includeRaw ? res.body.slice(0, MAX_RAW_EXCERPT) : null,
    };
  },
};

export const fetchRobots: ToolDefinition = {
  spec: {
    name: 'fetch_robots_txt',
    description:
      'Fetch /robots.txt for a domain and return the raw contents plus parsed user-agent rules and sitemap URLs. Use for crawl-directive questions, blocked-bot diagnostics, or finding the sitemap.',
    input_schema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain or full URL (e.g. example.com). Required.' },
      },
      required: ['domain'],
    },
  },
  handler: async (input) => {
    const raw = (input.domain as string)?.trim();
    if (!raw) return { error: 'domain is required' };
    let host: string;
    try {
      host = new URL(normalizeUrl(raw)).origin;
    } catch {
      return { error: `Invalid domain: ${raw}` };
    }
    const res = await fetchWithLimits(`${host}/robots.txt`, { ua: DEFAULT_UA });
    if (res.error || !res.ok) {
      return { url: `${host}/robots.txt`, status: res.status, error: res.error || `HTTP ${res.status}` };
    }
    const lines = res.body.split(/\r?\n/);
    const groups: Array<{ user_agents: string[]; allow: string[]; disallow: string[]; crawl_delay?: string }> = [];
    const sitemaps: string[] = [];
    let current: { user_agents: string[]; allow: string[]; disallow: string[]; crawl_delay?: string } | null = null;
    for (const ln of lines) {
      const line = ln.replace(/#.*$/, '').trim();
      if (!line) continue;
      const m = line.match(/^([A-Za-z-]+)\s*:\s*(.+)$/);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === 'user-agent') {
        if (!current || current.allow.length || current.disallow.length || current.crawl_delay) {
          current = { user_agents: [val], allow: [], disallow: [] };
          groups.push(current);
        } else {
          current.user_agents.push(val);
        }
      } else if (key === 'allow' && current) {
        current.allow.push(val);
      } else if (key === 'disallow' && current) {
        current.disallow.push(val);
      } else if (key === 'crawl-delay' && current) {
        current.crawl_delay = val;
      } else if (key === 'sitemap') {
        sitemaps.push(val);
      }
    }
    return {
      url: `${host}/robots.txt`,
      status: res.status,
      groups,
      sitemaps,
      raw: res.body.slice(0, 10_000),
    };
  },
};

interface SitemapEntry { loc: string; lastmod?: string; changefreq?: string; priority?: string }

function parseSitemapXml(xml: string): { type: 'index' | 'urlset' | 'unknown'; entries: SitemapEntry[]; sitemaps: string[] } {
  const entries: SitemapEntry[] = [];
  const sitemaps: string[] = [];
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const blockRegex = isIndex ? /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi : /<url\b[^>]*>([\s\S]*?)<\/url>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(xml)) !== null) {
    const block = m[1];
    const loc = (block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i) || [])[1];
    if (!loc) continue;
    if (isIndex) {
      sitemaps.push(loc);
    } else {
      const lastmod = (block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i) || [])[1];
      const changefreq = (block.match(/<changefreq>\s*([^<]+?)\s*<\/changefreq>/i) || [])[1];
      const priority = (block.match(/<priority>\s*([^<]+?)\s*<\/priority>/i) || [])[1];
      entries.push({ loc, lastmod, changefreq, priority });
    }
  }
  return { type: isIndex ? 'index' : entries.length ? 'urlset' : 'unknown', entries, sitemaps };
}

export const fetchSitemap: ToolDefinition = {
  spec: {
    name: 'fetch_sitemap',
    description:
      'Fetch a sitemap.xml (or sitemap index) and return its URL list. Auto-detects sitemap index files and optionally expands one level deep. Pass the full sitemap URL, or just a domain (will try /sitemap.xml). Returns up to 500 URLs by default.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Sitemap URL or domain. If a domain, fetches /sitemap.xml. Required.' },
        expand_index: { type: 'boolean', description: 'If the URL points to a sitemap index, fetch each child sitemap (up to 5). Default true.' },
        limit: { type: 'integer', description: 'Max URLs to return. Default 500, hard ceiling 5000.' },
      },
      required: ['url'],
    },
  },
  handler: async (input) => {
    const raw = (input.url as string)?.trim();
    if (!raw) return { error: 'url is required' };
    const limit = Math.min(Math.max(Number(input.limit) || 500, 1), 5000);
    const expand = input.expand_index !== false;
    let target = normalizeUrl(raw);
    if (!/sitemap.*\.xml/i.test(target) && !target.match(/\.(xml|xml\.gz)$/i)) {
      try { target = `${new URL(target).origin}/sitemap.xml`; } catch { /* ignore */ }
    }
    const root = await fetchWithLimits(target, { ua: DEFAULT_UA });
    if (root.error || !root.ok) {
      return { url: target, status: root.status, error: root.error || `HTTP ${root.status}` };
    }
    const parsed = parseSitemapXml(root.body);
    let entries = [...parsed.entries];
    const childSitemaps: Array<{ url: string; status: number; entry_count: number; error?: string }> = [];
    if (expand && parsed.type === 'index' && parsed.sitemaps.length) {
      for (const sm of parsed.sitemaps.slice(0, 5)) {
        if (entries.length >= limit) break;
        const child = await fetchWithLimits(sm, { ua: DEFAULT_UA });
        if (child.error || !child.ok) {
          childSitemaps.push({ url: sm, status: child.status, entry_count: 0, error: child.error || `HTTP ${child.status}` });
          continue;
        }
        const childParsed = parseSitemapXml(child.body);
        childSitemaps.push({ url: sm, status: child.status, entry_count: childParsed.entries.length });
        entries.push(...childParsed.entries);
      }
    }
    const truncated = entries.length > limit;
    if (truncated) entries = entries.slice(0, limit);
    return {
      url: target,
      status: root.status,
      type: parsed.type,
      child_sitemaps: parsed.sitemaps,
      child_results: childSitemaps,
      total_urls: entries.length,
      truncated,
      urls: entries,
    };
  },
};

interface CrawlPage {
  url: string;
  status: number;
  final_url: string;
  title: string | null;
  meta_description: string | null;
  canonical: string | null;
  h1: string | null;
  h1_count: number;
  word_count: number;
  internal_links: number;
  external_links: number;
  depth: number;
  elapsed_ms: number;
  content_type: string | null;
  size_bytes: number;
  error?: string;
}

export const crawlSite: ToolDefinition = {
  spec: {
    name: 'crawl_site',
    description:
      "Run a small in-process crawl from a seed URL (BFS, same-host only) and return per-URL SEO data plus aggregated issue lists (broken links, missing titles, missing meta descriptions, duplicate titles, redirect chains, missing h1s). This is the in-house ScreamingFrog: fast for spot checks (default 25 URLs, hard ceiling 50). For larger crawls, run ScreamingFrog locally and share the export.",
    input_schema: {
      type: 'object',
      properties: {
        seed_url: { type: 'string', description: 'Starting URL or domain. Required.' },
        max_urls: { type: 'integer', description: 'Maximum pages to crawl. Default 25, hard ceiling 50.' },
        max_depth: { type: 'integer', description: 'Max link depth from seed. Default 2.' },
        include_subdomains: { type: 'boolean', description: 'Follow links to subdomains of the seed host. Default false.' },
        user_agent: { type: 'string', description: "Override UA. 'googlebot' for Google UA. Default browser-like." },
      },
      required: ['seed_url'],
    },
  },
  handler: async (input) => {
    const seedRaw = (input.seed_url as string)?.trim();
    if (!seedRaw) return { error: 'seed_url is required' };
    const maxUrls = Math.min(Math.max(Number(input.max_urls) || 25, 1), 50);
    const maxDepth = Math.min(Math.max(Number(input.max_depth) || 2, 0), 5);
    const includeSubs = input.include_subdomains === true;
    const ua = pickUserAgent(input);
    const seed = normalizeUrl(seedRaw);

    let seedHost: string;
    try { seedHost = new URL(seed).hostname.replace(/^www\./, ''); } catch { return { error: `Invalid seed_url: ${seed}` }; }

    const queue: Array<{ url: string; depth: number }> = [{ url: seed, depth: 0 }];
    const seen = new Set<string>([normalizeUrl(seed)]);
    const pages: CrawlPage[] = [];
    const startedAt = Date.now();
    const HARD_TIMEOUT = 50_000;

    function sameHost(host: string): boolean {
      const h = host.replace(/^www\./, '');
      if (h === seedHost) return true;
      if (includeSubs && (h.endsWith(`.${seedHost}`) || seedHost.endsWith(`.${h}`))) return true;
      return false;
    }

    while (queue.length && pages.length < maxUrls) {
      if (Date.now() - startedAt > HARD_TIMEOUT) break;
      const { url, depth } = queue.shift()!;
      const res = await fetchWithLimits(url, { ua, maxBytes: 1_500_000 });

      const page: CrawlPage = {
        url,
        status: res.status,
        final_url: res.final_url,
        title: null,
        meta_description: null,
        canonical: null,
        h1: null,
        h1_count: 0,
        word_count: 0,
        internal_links: 0,
        external_links: 0,
        depth,
        elapsed_ms: res.elapsed_ms,
        content_type: res.content_type,
        size_bytes: res.size_bytes,
      };
      if (res.error) {
        page.error = res.error;
      } else if (res.body && (res.content_type || '').toLowerCase().includes('html')) {
        try {
          const $ = load(res.body);
          page.title = $('title').first().text().trim() || null;
          page.meta_description = $('meta[name="description"]').first().attr('content') || null;
          page.canonical = $('link[rel="canonical"]').first().attr('href') || null;
          const h1s = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean);
          page.h1 = h1s[0] || null;
          page.h1_count = h1s.length;
          const text = $('body').text().replace(/\s+/g, ' ').trim();
          page.word_count = text ? text.split(/\s+/).length : 0;

          if (depth < maxDepth) {
            $('a[href]').each((_, el) => {
              const href = $(el).attr('href');
              if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
              let abs: string;
              try { abs = new URL(href, res.final_url).toString().split('#')[0]; } catch { return; }
              let host: string;
              try { host = new URL(abs).hostname; } catch { return; }
              const isInternal = sameHost(host);
              if (isInternal) page.internal_links += 1; else page.external_links += 1;
              if (!isInternal) return;
              if (seen.has(abs)) return;
              seen.add(abs);
              if (queue.length + pages.length < maxUrls * 4) queue.push({ url: abs, depth: depth + 1 });
            });
          }
        } catch (err) {
          page.error = `Parse error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      pages.push(page);
    }

    const broken: Array<{ url: string; status: number }> = [];
    const missingTitles: string[] = [];
    const missingMeta: string[] = [];
    const missingH1: string[] = [];
    const titleMap = new Map<string, string[]>();
    const redirected: Array<{ url: string; final_url: string }> = [];
    for (const p of pages) {
      if (p.status >= 400 || p.status === 0) broken.push({ url: p.url, status: p.status });
      if (!p.title) missingTitles.push(p.url);
      else {
        const arr = titleMap.get(p.title) || [];
        arr.push(p.url);
        titleMap.set(p.title, arr);
      }
      if (!p.meta_description) missingMeta.push(p.url);
      if (!p.h1) missingH1.push(p.url);
      if (p.final_url && p.final_url !== p.url) redirected.push({ url: p.url, final_url: p.final_url });
    }
    const duplicateTitles: Array<{ title: string; urls: string[] }> = [];
    for (const [t, urls] of titleMap.entries()) {
      if (urls.length > 1) duplicateTitles.push({ title: t, urls });
    }

    return {
      seed_url: seed,
      seed_host: seedHost,
      include_subdomains: includeSubs,
      max_urls: maxUrls,
      max_depth: maxDepth,
      pages_crawled: pages.length,
      elapsed_ms: Date.now() - startedAt,
      timed_out: Date.now() - startedAt > HARD_TIMEOUT,
      pages,
      issues: {
        broken_links: broken,
        redirected,
        missing_titles: missingTitles,
        missing_meta_descriptions: missingMeta,
        missing_h1: missingH1,
        duplicate_titles: duplicateTitles,
      },
    };
  },
};

export const validateStructuredData: ToolDefinition = {
  spec: {
    name: 'validate_structured_data',
    description:
      'Run a URL through validator.schema.org and return extracted Schema.org graph plus per-node validation errors. Use this to verify whether a page has valid Article, Product, Recipe, FAQPage, BreadcrumbList, Organization, etc. structured data, and to surface missing required properties or type errors.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to validate. Required.' },
      },
      required: ['url'],
    },
  },
  handler: async (input) => {
    const url = (input.url as string)?.trim();
    if (!url) return { error: 'url is required' };
    const target = normalizeUrl(url);
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch('https://validator.schema.org/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({ url: target }).toString(),
        signal: controller.signal,
      });
      let text = await res.text();
      if (text.startsWith(")]}'")) text = text.slice(4);
      let data: unknown;
      try { data = JSON.parse(text); } catch {
        return { url: target, status: res.status, error: 'Could not parse validator response', raw_excerpt: text.slice(0, 500) };
      }
      const root = data as { tripleGroups?: Array<{ nodes?: Array<{ types?: Array<{ value?: string }>; errors?: unknown[] }> }>; errors?: unknown[] };
      const groups = Array.isArray(root.tripleGroups) ? root.tripleGroups : [];
      const summary: Array<{ type: string; error_count: number; errors: unknown[] }> = [];
      let totalNodes = 0;
      let nodesWithErrors = 0;
      for (const g of groups) {
        for (const n of g.nodes || []) {
          totalNodes += 1;
          const t = n.types?.[0]?.value || 'Unknown';
          const errs = Array.isArray(n.errors) ? n.errors : [];
          if (errs.length) nodesWithErrors += 1;
          summary.push({ type: t, error_count: errs.length, errors: errs.slice(0, 8) });
        }
      }
      return {
        url: target,
        elapsed_ms: Date.now() - start,
        status: res.status,
        total_nodes: totalNodes,
        nodes_with_errors: nodesWithErrors,
        types_found: [...new Set(summary.map((s) => s.type))],
        nodes: summary,
        top_level_errors: Array.isArray(root.errors) ? root.errors : [],
      };
    } catch (err) {
      return { url: target, error: err instanceof Error ? err.message : String(err), elapsed_ms: Date.now() - start };
    } finally {
      clearTimeout(timer);
    }
  },
};

export const webToolDefinitions: ToolDefinition[] = [
  fetchPage,
  fetchRobots,
  fetchSitemap,
  crawlSite,
  validateStructuredData,
];
