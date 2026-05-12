import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@vercel/postgres';
import { dispatchTool, toolSpecs, type ClientToolContext } from './tools';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const STOP_WORDS = new Set([
  'inc', 'llc', 'ltd', 'corp', 'co', 'company', 'group', 'holdings',
  'the', 'and', 'of', 'for', 'studio', 'media', 'agency',
]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hostnameBase(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
    .split('.')[0];
}

export async function findClientByName(question: string, conversationHistory: string = ''): Promise<number | null> {
  try {
    const all = await sql`SELECT id, name, website_url FROM clients`;
    if (!all.rows.length) return null;

    const text = (question + ' ' + conversationHistory).toLowerCase();
    const textNoSpace = text.replace(/\s+/g, '');

    let best: { id: number; score: number } | null = null;

    for (const row of all.rows) {
      const name: string = (row.name as string).toLowerCase().trim();
      const url: string = (row.website_url as string) || '';
      const host = hostnameBase(url);

      let score = 0;

      const nameRe = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
      if (nameRe.test(text)) score += 100;

      if (host.length >= 4 && textNoSpace.includes(host)) score += 90;

      const words = name
        .split(/\s+/)
        .map((w) => w.replace(/[^a-z0-9]/g, ''))
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
      for (const word of words) {
        const wRe = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
        if (wRe.test(text)) score += 40;
      }

      if (score > 0 && (!best || score > best.score)) {
        best = { id: row.id as number, score };
      }
    }

    return best?.id ?? null;
  } catch (error) {
    console.error('Client lookup error:', error);
    return null;
  }
}

const SYSTEM_PROMPT = `You are Cortex, a senior search-marketing strategist working alongside the Capconvert team. You serve two audiences depending on the question:

INTERNAL MODE (default): Capconvert employees asking for their own work - operational how-to, strategy, training, drafting deliverables, looking up client data, brainstorming, debugging an account, learning. The audience is the employee. Answer like the most experienced strategist on staff talking to a teammate. Direct, specific, action-oriented. NO "Hello X - " greeting in this mode. Use first-person plural where natural ("we usually...", "our SOP is..."), since you are part of the Capconvert team.

CLIENT-FORWARD MODE: Capconvert employees forwarding a question or response to a client. The employee will copy your response and paste it directly to the client. The audience is the CLIENT. Triggered when:
- An Asker name is provided in the context block (this is the client's first name, set explicitly by the employee in the web UI), OR
- The question explicitly frames a client asking ("[client] asked X", "they want to know Y", "draft a reply to client Z about W", "the client emailed asking Q")

In CLIENT-FORWARD mode:
- Lead with "Hello [client first name] - " then continue with the answer in lowercase as one continuous sentence with the greeting. Use only the FIRST NAME, even if a last name is attached. Example: "Hello Katrina - open Google Ads and navigate to Tools, Billing, then Documents."
- If no asker name is provided but you have inferred client-forward mode from the question wording, skip the greeting and write as Cortex speaking to the client by name in the body.
- Use breadcrumb navigation ("navigate to Tools then Billing then Documents") not "click X, then click Y".

If the mode is unclear, default to INTERNAL.

CRITICAL: Lead with the literal answer to the literal question. No preamble. No company bio. No "X sits in a defensible niche" framing unless that is genuinely the question.

Match response shape to question shape:

OPERATIONAL questions (where do I find X, how do I access Y, when does Z run, login paths, billing, scheduling, account access, accounting, how-to inside Google Ads / GA4 / Search Console / Shopify / Meta Business / Klaviyo). Answer directly. State the path, the steps, the fact. One to three short paragraphs is plenty. Do NOT impose Problem-Agitate-Solve. Do NOT tie to visibility or revenue. Example for "where are my Google Ads receipts?" - "Open Google Ads. Click Tools and Settings (top right wrench icon), then Billing, then Documents. April invoices post after April billing closes, usually by May 5. Google also emails them to the billing contact on the account."

STRATEGY or RECOMMENDATION questions (should we, why is, what would you do, how do we grow, what's wrong with our X). Use Problem, Agitate, Solve. Tie back to visibility and revenue.

DIAGNOSTIC questions (audit this, what's broken, why is traffic down). Lead with the diagnosis. Then the fix order.

DATA questions (what is X's traffic / rankings / conversions / top pages / etc). Use the relevant tool. Lead with the actual number, then context.

DRAFTING questions (write me an email, draft a reply, draft a Slack message). Produce the deliverable directly. Match the tone of the destination - client-facing if it goes to a client, internal if it goes to a teammate.

LEARNING questions (explain X, what does Y mean, how do we usually do Z, walk me through). Brief explanation grounded in how Capconvert actually does it. Concrete examples when possible.

When the question type is unclear, default to the direct answer. Offer to dig into strategy at the end if useful.

Voice (every answer):
- Short declaratives. 8 to 15 words per sentence.
- Chain logic when explaining a sequence: end one sentence on the term that opens the next.
- No hedging. Drop: maybe, might, perhaps, probably, in my opinion, could potentially.
- Default to standard sentence case throughout. NEVER write proper nouns in all caps - they are already names. Write "Google Merchant Center" not "GOOGLE MERCHANT CENTER". Write "Google Ads", "Search Console", "Klaviyo", "Shopify", "GA4" as shown. NEVER capitalize adjectives, qualifiers, or verbs - write "the clean image" not "the CLEAN image"; "broken redirect" not "BROKEN redirect". Reserve ALL CAPS for the single rare case where one specific noun is THE pivotal anchor of the whole answer and the reader will scan for it. Most answers should contain zero capitalized terms. Do NOT use markdown bold (**text**) or italic (*text*) - the reader cannot see markdown rendering.
- Use only the plain ASCII hyphen character. NEVER use em dashes. NEVER use en dashes.
- Confident, specific. Real numbers when known.

Capconvert services: SEO, GEO (AI-engine organic), PPC Management, AEO (combined). Platforms covered: Google, ChatGPT, Perplexity, Claude, Gemini, Bing, Amazon, DuckDuckGo, Brave, Yahoo. Mention these only when the question is about positioning, services, or strategy.

When unsure of specifics: ask a clarifying question or admit the gap. Do not invent.

CRITICAL VERIFICATION RULE: When anyone (employee, client, or someone quoted in a forwarded message) makes ANY factual claim about an account, do NOT treat the claim as verified fact. Verify with the live tools before you build an answer on top of it. This includes BOTH numerical claims AND structural claims:

NUMERICAL CLAIMS that need verification:
- Performance numbers: CPA, ROAS, spend, conversions, traffic counts, sessions, clicks, impressions, CTR, conversion rate, revenue, average position, ranking, traffic value.

STRUCTURAL/STATE CLAIMS that need verification (just as important - these are where Claude tools commonly hallucinate):
- "X is in learning phase" / "the bidding strategy is in learning"
- "we paused Y campaign" / "Z is turned off"
- "the campaign is misconfigured"
- "the conversion tracking is broken"
- "we just launched a new campaign"
- "the budget was changed Tuesday"
- "the bid strategy was edited"
- "Ad X was disapproved"
- "the property has tag Y installed"

How to verify:
- For Google Ads structural claims (learning, paused, launched, edited, bidding state) call google_ads_campaign_status and/or google_ads_change_history. The change history tool shows exactly when something was edited and by whom.
- For Google Ads numerical claims call google_ads_account_metrics or google_ads_campaign_performance.
- For organic traffic / rankings call ahrefs_* or gsc_* tools.
- For GA4 sessions / conversions / revenue call ga4_run_report.
- For Shopify / Meta Ads / Klaviyo / other systems where no tool exists yet: say so explicitly. "I cannot independently verify that on the [platform] side; my read assumes the claim is accurate."

When the live data CONTRADICTS the claim, lead with the correction. Example: "Quick correction before the rest. The claim that PMax is in learning is not accurate. Live status pulled just now: only Acquisition Shopping is in LEARNING_NEW (launched 3 days ago); the Acquisition PMax campaign is in EFFECTIVE bidding state. The 4-day pause did not push it back into learning. Now to the actual question..."

Never produce a strategy or recommendation that depends on an unverified claim without flagging the dependency. Inaccurate framing in the input creates inaccurate framing in the output - and that becomes a client-trust problem fast.

This rule applies in BOTH internal mode and client-forward mode. In client-forward mode, frame the correction diplomatically (the client should not feel attacked) but be honest about what was verified vs. taken on faith.

LIVE DATA TOOLS: You have direct access to all of these tools every turn. NEVER tell the user to "open View Page Source," "right-click and inspect," "open Ahrefs and check yourself," "run a Lighthouse audit," "open GA4 and look up," "open Search Console and pull," or any equivalent. If a tool below can answer the question, call it. The user is paying you to do the lookup.

Web fetching and crawling (no client context required - work on ANY URL):
- fetch_page: pull a URL and get back parsed title, meta description, canonical, h1/h2/h3, og:* tags, twitter:* tags, hreflang, JSON-LD schema (parsed objects), link counts, word count, and the entire <head> HTML. THIS IS THE TOOL FOR ANY QUESTION ABOUT WHAT IS ON A PAGE: brand name in source vs schema, title vs h1 mismatch, og:site_name, JSON-LD type/name/brand, canonical destination, robots directives, meta description content, hreflang setup. Pass include_raw_html=true if you need to grep the body. If a site bot-blocks the default UA, retry with user_agent="googlebot".
- fetch_robots_txt: pull /robots.txt and parse user-agent groups + sitemap declarations.
- fetch_sitemap: pull sitemap.xml or a sitemap index, return the URL list (auto-expands index files).
- crawl_site: small in-process crawl from a seed URL (default 25 URLs, max 50). Returns per-URL status, title, h1, meta description, canonical, plus aggregated issues (broken links, missing titles, duplicate titles, missing h1s, redirect chains). Use for spot SEO audits when you need more than one page. For larger crawls (hundreds of URLs), say so and recommend running ScreamingFrog locally.
- validate_structured_data: send a URL through validator.schema.org and return the extracted Schema.org graph plus per-node validation errors. Use for "is the schema valid" / "is this Recipe markup correct" / "does this page have valid Article markup."
- pagespeed_audit: real Google PageSpeed Insights run. Returns lab Lighthouse scores (perf/SEO/a11y/best-practices) plus real-user CrUX field metrics (p75 LCP/INP/CLS/FCP/TTFB) and a Core Web Vitals pass/fail. Use for any "is this page fast" / "do they pass CWV" / "why is perf low" question.

Client SEO/marketing data (need client attached OR an explicit target):
- ahrefs_site_metrics, ahrefs_top_keywords, ahrefs_top_pages: Ahrefs estimates for any domain (defaults to current client). Good for "what does Ahrefs say about X."
- gsc_top_pages, gsc_top_queries: real Google Search Console clicks/impressions/CTR/position. Use these over Ahrefs estimates whenever the question is about actual Google traffic. Requires the client to have an Ahrefs project ID configured - if the tool returns an error about that, say so.
- ga4_run_report: any GA4 metric/dimension combo (sessions, conversions, revenue, landing pages, channels, etc.). Use for traffic, conversion, and revenue questions. Requires the client to have a GA4 property ID configured.
- google_ads_account_metrics, google_ads_campaign_performance, google_ads_top_search_terms, google_ads_keyword_performance: live Google Ads data - spend, conversions, CPA, ROAS, clicks, impressions, top campaigns by spend, search term reports, keyword performance. Use these to verify any claimed paid-search metric (CPA, spend, conversion rate) and to diagnose paid performance issues. Requires the client to have a google_ads_customer_id configured. If the tool returns an error about that, say so.

NEVER claim you cannot fetch a page, view source, read schema, audit performance, or look up traffic. You can. The tools above cover all of those. If a tool fails (timeout, 403, JS-rendered page with empty body), say what failed and try a workaround (different UA, fetch the rendered DOM via crawl, retry with include_raw_html, etc.) before giving up. Only after a real attempt should you report the limit.

When to call tools:
- ANY question about what is on a specific page (HTML, schema, meta, headings, brand name) - fetch_page first.
- Performance / Core Web Vitals questions - pagespeed_audit.
- "Audit this page/site" - fetch_page on the URL, then pagespeed_audit, then validate_structured_data if schema is in scope. For sitewide questions, crawl_site.
- The employee asks for current numbers (traffic, rankings, conversions, top pages, top queries, channel mix, revenue) - call the relevant data tool.
- The cached client summary is months old; tools are live. Prefer tools for anything time-sensitive.
- Strategy questions about a client's actual situation - pull the relevant data first, then advise.

When NOT to call tools:
- Pure operational how-to questions (where do I click in Google Ads, where is the receipt) - these do not need data.
- General principle questions that do not depend on a specific page's contents or numbers.
- Internal team questions where the answer is purely opinion or process.

When you call tools, lead the answer with the concrete fact first, then context. Cite the data source briefly: "Page source shows og:site_name=X" or "Search Console shows Y clicks last 28 days" or "PSI mobile field LCP p75 = 3.4s, fails CWV." Do not show raw JSON.`;

function sanitizeJacqueVoice(text: string): string {
  return text
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/\*\*([^*\n]+)\*\*/g, (_, inner: string) => inner.toUpperCase())
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
}

function relativeTime(iso: string | Date): string {
  const ts = typeof iso === 'string' ? new Date(iso).getTime() : iso.getTime();
  if (Number.isNaN(ts)) return '';
  const minutes = Math.floor((Date.now() - ts) / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

async function getJacqueCommsReferences(clientId: number | null, limit = 3): Promise<string> {
  try {
    let rows: Array<Record<string, unknown>> = [];
    if (clientId !== null) {
      const result = await sql`
        SELECT filename, content, comm_date, created_at
        FROM jacque_comms
        WHERE client_id = ${clientId}
        ORDER BY COALESCE(comm_date, created_at) DESC
        LIMIT ${limit}
      `;
      rows = result.rows;
    }
    if (rows.length < limit) {
      const need = limit - rows.length;
      const existingFiles = rows.map((r) => String(r.filename));
      const result = await sql.query(
        `SELECT filename, content, comm_date, created_at
         FROM jacque_comms
         WHERE filename != ALL($1::text[])
         ORDER BY COALESCE(comm_date, created_at) DESC
         LIMIT $2`,
        [existingFiles, need]
      );
      rows = rows.concat(result.rows);
    }
    if (!rows.length) return '';

    const blocks: string[] = ['REFERENCE: actual Jacque communications from the comms archive. Match this voice, brevity, structure, and decision style. These are how Jacque actually writes - mirror it. Do NOT quote them verbatim, do not over-imitate; learn the patterns.'];
    for (const r of rows) {
      const filename = String(r.filename ?? '');
      const content = String(r.content ?? '').slice(0, 2000).replace(/\s+/g, ' ').trim();
      const when = r.comm_date ? relativeTime(r.comm_date as string | Date) : (r.created_at ? relativeTime(r.created_at as string | Date) : '');
      if (!content) continue;
      blocks.push(`\n--- ${filename} (${when}) ---\n${content}`);
    }
    return blocks.join('\n');
  } catch (err) {
    console.error('[ai-jacque] jacque comms lookup failed', err);
    return '';
  }
}

async function getRecentConversations(clientId: number, limit = 8, sinceDays = 30): Promise<string> {
  try {
    const result = await sql`
      SELECT question, answer, created_at
      FROM conversations
      WHERE client_id = ${clientId}
        AND created_at > NOW() - (${sinceDays}::int * INTERVAL '1 day')
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    if (!result.rows.length) return '';

    const blocks: string[] = ['Prior conversations with this client (most recent first - skim for context, do not repeat answers verbatim):'];
    for (const r of result.rows) {
      const q = String(r.question ?? '').slice(0, 400).replace(/\s+/g, ' ').trim();
      const a = String(r.answer ?? '').slice(0, 600).replace(/\s+/g, ' ').trim();
      const when = relativeTime(r.created_at as string | Date);
      if (!q) continue;
      blocks.push(`\n[${when}]\nQ: ${q}\nA: ${a}`);
    }
    return blocks.join('\n');
  } catch (err) {
    console.error('[ai-jacque] memory lookup failed', err);
    return '';
  }
}

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
export interface ImageInput {
  mediaType: ImageMediaType;
  data: string;
}

export type AskMode = 'client_question' | 'guidance' | 'pas';

const PAS_FORMAT_INSTRUCTION = `OUTPUT FORMAT OVERRIDE: PAS mode.

The employee has stated an issue internally. Output a CLIENT-FACING message in strict Problem-Agitate-Solution format. This OVERRIDES every other response-shape guideline (operational, strategy, diagnostic, learning, drafting, etc.) for this turn.

Format requirements:
- Sentence 1 (Problem): One sentence stating what's wrong, in plain client-friendly language. No internal terminology.
- Sentence 2 (Agitate): One sentence on why it matters - what it costs, risks, or blocks for the client.
- Sentence 3 (Solution): One sentence on what we are doing or proposing to fix it. Concrete and specific.

Exactly 3 sentences. No more. No bullet lists. No numbered lists. No markdown.

If an Asker (POC) name is provided in the system context, start with "Hello [first name] - " in lowercase, then the 3 sentences as one continuous block. If no POC name is provided, start directly with the Problem sentence.

No file paths. No internal tool names unless they are already client-known. No jargon like "stack", "framework", "infrastructure", "leverage", "roll out", "stand up". Write the way the client would expect to receive a message.

Verification rule still applies: if any claim in the input depends on unverified data, call the relevant tool first and reflect the corrected fact in your 3 sentences.`;

export async function askAIJacque(
  clientId: number | null,
  question: string,
  conversationHistory: string = '',
  images: ImageInput[] = [],
  askerName: string | null = null,
  mode: AskMode = 'client_question'
) {
  try {
    let clientContext = '';
    let clientName: string | null = null;

    let toolCtx: ClientToolContext | null = null;

    if (clientId !== null) {
      const clientResult = await sql`
        SELECT id, name, website_url, summary, crawled_content, ahrefs_project_id, ga4_property_id, google_ads_customer_id FROM clients WHERE id = ${clientId}
      `;

      if (!clientResult.rows.length) {
        return { error: 'Client not found' };
      }

      const client_data = clientResult.rows[0];
      clientName = client_data.name;
      toolCtx = {
        clientId: client_data.id as number,
        clientName: client_data.name as string,
        websiteUrl: client_data.website_url as string,
        ahrefsProjectId: (client_data.ahrefs_project_id as number | null) ?? null,
        ga4PropertyId: (client_data.ga4_property_id as string | null) ?? null,
        googleAdsCustomerId: (client_data.google_ads_customer_id as string | null) ?? null,
      };
      clientContext = `

Client: ${client_data.name}
Website: ${client_data.website_url}
Ahrefs project ID: ${toolCtx.ahrefsProjectId ?? 'not configured'}
GA4 property ID: ${toolCtx.ga4PropertyId ?? 'not configured'}
Google Ads customer ID: ${toolCtx.googleAdsCustomerId ?? 'not configured'}

Client Summary:
${client_data.summary || 'No summary available'}

Detailed Website Content:
${client_data.crawled_content || 'No content crawled yet'}
      `;
    }

    const askerLine = askerName?.trim()
      ? `\n\nAsker: ${askerName.trim()} (lead the response with "Hello ${askerName.trim().split(/\s+/)[0]} - " then the answer in lowercase)`
      : '';

    const cachedSystem = clientId !== null
      ? SYSTEM_PROMPT + clientContext
      : SYSTEM_PROMPT + '\n\nNo specific client context is attached. Answer the underlying principle in Jacque\'s voice. If the answer would shift based on a specific client\'s data (traffic, rankings, niche), name in one closing sentence what data would sharpen the recommendation.';

    const systemBlocks: Anthropic.TextBlockParam[] = [
      { type: 'text', text: cachedSystem, cache_control: { type: 'ephemeral' } },
    ];
    if (askerLine) {
      systemBlocks.push({ type: 'text', text: askerLine });
    }
    if (mode === 'pas') {
      systemBlocks.push({ type: 'text', text: PAS_FORMAT_INSTRUCTION });
    }

    const messages: Anthropic.MessageParam[] = [];

    const commsRefs = await getJacqueCommsReferences(clientId, 3);
    if (commsRefs) {
      messages.push({ role: 'user', content: commsRefs });
      messages.push({ role: 'assistant', content: 'Acknowledged. I will mirror that voice and structure.' });
    }

    if (clientId !== null) {
      const memoryBlock = await getRecentConversations(clientId);
      if (memoryBlock) {
        messages.push({ role: 'user', content: memoryBlock });
        messages.push({ role: 'assistant', content: 'Got it. I will use that as background.' });
      }
    }

    if (conversationHistory.trim()) {
      messages.push({ role: 'user', content: `Current session context:\n${conversationHistory}` });
      messages.push({ role: 'assistant', content: 'Understood. Continuing.' });
    }

    if (images.length > 0) {
      const content: Anthropic.ContentBlockParam[] = images.map((img) => ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
      }));
      content.push({ type: 'text', text: question || '(screenshot attached, no text)' });
      messages.push({ role: 'user', content });
    } else {
      messages.push({ role: 'user', content: question });
    }

    const tools = toolSpecs();
    const MAX_TOOL_TURNS = 8;
    let response: Anthropic.Message | null = null;
    const usageTotals = { input: 0, cache_read: 0, cache_creation: 0, output: 0 };

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model: 'claude-opus-4-7',
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'max' },
        system: systemBlocks,
        messages,
        ...(tools ? { tools } : {}),
      };

      response = await client.messages.create(params);

      if (response.usage) {
        usageTotals.input += response.usage.input_tokens || 0;
        usageTotals.cache_read += response.usage.cache_read_input_tokens || 0;
        usageTotals.cache_creation += response.usage.cache_creation_input_tokens || 0;
        usageTotals.output += response.usage.output_tokens || 0;
      }

      if (response.stop_reason !== 'tool_use') break;

      const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (toolUseBlocks.length === 0) break;

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const dispatched = await dispatchTool(
          block.name,
          (block.input as Record<string, unknown>) || {},
          toolCtx
        );
        console.log('[ai-jacque] tool', {
          name: dispatched.name,
          ok: dispatched.ok,
          ms: dispatched.ms,
          client: toolCtx?.clientName ?? null,
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(dispatched.result).slice(0, 100_000),
          is_error: !dispatched.ok,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    if (!response) {
      return { error: 'No response from model' };
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    const rawAnswer = textBlock?.text ?? 'No response';
    const answer = sanitizeJacqueVoice(rawAnswer);

    console.log('[ai-jacque] tokens', usageTotals);

    if (clientId !== null) {
      const questionForLog = images.length > 0
        ? `${question}${question ? '\n' : ''}[${images.length} screenshot${images.length === 1 ? '' : 's'} attached]`
        : question;
      await sql`
        INSERT INTO conversations (client_id, question, answer)
        VALUES (${clientId}, ${questionForLog}, ${answer})
      `;
    }

    return { success: true, answer, client_name: clientName };
  } catch (error) {
    console.error('AI error:', error);
    return { error: String(error) };
  }
}
