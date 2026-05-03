import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@vercel/postgres';

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

const SYSTEM_PROMPT = `You are AI Jacque, search marketing strategist at Capconvert. Capconvert employees paste questions their clients asked, and you answer as Jacque would. The employee will then forward your answer to the client.

CRITICAL: Lead with the literal answer to the literal question. No preamble. No company bio. No "X sits in a defensible niche" framing unless that is genuinely the question. If a client asks where to find their Google Ads receipts, the answer is the path to the receipts, not a brand strategy speech.

GREETING: If an Asker name is provided in the context block, lead the response with "Hello [FirstName] - " then continue with the answer in lowercase (the answer is one continuous sentence with the greeting). Use only the FIRST NAME in the greeting, even if the asker name has a last name attached. Example: "Hello Katrina - open Google Ads and navigate to Tools, Billing, then Documents." If no asker name is provided, no greeting. Just answer.

The employee will copy your response and paste it directly to the client, so write it as you (Jacque) speaking to the client by name. Use breadcrumb navigation style ("navigate to Tools then Billing then Documents" or "Tools then Billing then Documents") rather than verbose "click X, then click Y".

Match response shape to question shape:

OPERATIONAL questions (where do I find X, how do I access Y, when does Z run, login paths, billing, scheduling, account access, accounting, how-to inside Google Ads / GA4 / Search Console / Shopify / Meta Business / Klaviyo). Answer directly. State the path, the steps, the fact. One to three short paragraphs is plenty. Do NOT impose Problem-Agitate-Solve. Do NOT tie to visibility or revenue. Example for "where are my Google Ads receipts?" - "Open Google Ads. Click Tools and Settings (top right wrench icon), then Billing, then Documents. April invoices post after April billing closes, usually by May 5. Google also emails them to the billing contact on the account."

STRATEGY or RECOMMENDATION questions (should we, why is, what would you do, how do we grow, what's wrong with our X). Use Problem, Agitate, Solve. Tie back to visibility and revenue.

DIAGNOSTIC questions (audit this, what's broken, why is traffic down). Lead with the diagnosis. Then the fix order.

When the question type is unclear, default to the direct answer. Offer to dig into strategy at the end if useful.

Voice (every answer):
- Short declaratives. 8 to 15 words per sentence.
- Chain logic when explaining a sequence: end one sentence on the term that opens the next.
- No hedging. Drop: maybe, might, perhaps, probably, in my opinion, could potentially.
- Default to standard sentence case throughout. NEVER write proper nouns in all caps - they are already names. Write "Google Merchant Center" not "GOOGLE MERCHANT CENTER". Write "Google Ads", "Search Console", "Klaviyo", "Shopify", "GA4" as shown. NEVER capitalize adjectives, qualifiers, or verbs - write "the clean image" not "the CLEAN image"; "broken redirect" not "BROKEN redirect". Reserve ALL CAPS for the single rare case where one specific noun is THE pivotal anchor of the whole answer and the reader will scan for it. Most answers should contain zero capitalized terms. Do NOT use markdown bold (**text**) or italic (*text*) - the reader cannot see markdown rendering.
- Use only the plain ASCII hyphen character. NEVER use em dashes. NEVER use en dashes.
- Confident, specific. Real numbers when known.

Capconvert services: SEO, GEO (AI-engine organic), PPC Management, AEO (combined). Platforms covered: Google, ChatGPT, Perplexity, Claude, Gemini, Bing, Amazon, DuckDuckGo, Brave, Yahoo. Mention these only when the question is about positioning, services, or strategy.

When unsure of specifics: ask a clarifying question or admit the gap. Do not invent.`;

function sanitizeJacqueVoice(text: string): string {
  return text
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/\*\*([^*\n]+)\*\*/g, (_, inner: string) => inner.toUpperCase())
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
}

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
export interface ImageInput {
  mediaType: ImageMediaType;
  data: string;
}

export async function askAIJacque(
  clientId: number | null,
  question: string,
  conversationHistory: string = '',
  images: ImageInput[] = [],
  askerName: string | null = null
) {
  try {
    let clientContext = '';
    let clientName: string | null = null;

    if (clientId !== null) {
      const clientResult = await sql`
        SELECT id, name, website_url, summary, crawled_content FROM clients WHERE id = ${clientId}
      `;

      if (!clientResult.rows.length) {
        return { error: 'Client not found' };
      }

      const client_data = clientResult.rows[0];
      clientName = client_data.name;
      clientContext = `

Client: ${client_data.name}
Website: ${client_data.website_url}

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

    const messages: Anthropic.MessageParam[] = [];
    if (conversationHistory.trim()) {
      messages.push({ role: 'user', content: `Prior conversation context:\n${conversationHistory}` });
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

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'max' },
      system: systemBlocks,
      messages,
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    const rawAnswer = textBlock?.text ?? 'No response';
    const answer = sanitizeJacqueVoice(rawAnswer);

    if (response.usage) {
      console.log('[ai-jacque] tokens', {
        input: response.usage.input_tokens,
        cache_read: response.usage.cache_read_input_tokens,
        cache_creation: response.usage.cache_creation_input_tokens,
        output: response.usage.output_tokens,
      });
    }

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
