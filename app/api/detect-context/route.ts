import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@vercel/postgres';

// Fast Haiku-based extraction of "who is this screenshot about". Runs the
// moment the user attaches an image so the client picker + POC field can
// auto-populate before they even hit send. The /api/ask flow stays
// unchanged - this endpoint is purely best-effort UI fill.

export const maxDuration = 30;

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const ALLOWED_MEDIA_TYPES: ImageMediaType[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

interface ImageInput {
  mediaType: ImageMediaType;
  data: string;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Cache the system prompt across calls; it includes the full known-client
// list so the cache hit lands on every subsequent extract within the TTL.
const SYSTEM_PROMPT_HEAD = `You extract the Capconvert client and the client-side point of contact (POC) from screenshots.

Capconvert is a search-marketing agency. Capconvert teammates have @capconvert.com email addresses. Everyone else in the screenshot is on the client side.

For each screenshot, identify:
- client: the client company name (NOT Capconvert). Look at: the email sender's domain, the Slack channel name (channels are usually named like "feno-sem", "rentredi-seo"), the Shopify store name in the header, the GA4 property name, subject lines that contain a brand, and any signature blocks.
- poc: the first name of the client-side person being addressed or who is writing. Look for: "Hello [Name] - ", email sender first names with non-capconvert domains, signature blocks. NEVER pick a Capconvert teammate as POC (common Capconvert first names to exclude: jacque, jacque alec, andres, andrés, gary, tim, paula, allison, nikki, katherine, sean, tiffany).

Channel-name heuristic: a Slack channel like "rentredi-sem" → client is "RentRedi" (drop the trailing "-sem" / "-seo" / "-ppc" / "-aeo" / "-geo" suffix, restore the brand's normal casing).

If you can match the client to one of the known Capconvert clients listed below, return the exact name as listed (fuzzy matching is fine - "Doggie Lawn" → "DoggieLawn", "Feno Toothbrush" → "Feno").

Known Capconvert clients:
`;

const SYSTEM_PROMPT_TAIL = `

Respond with ONLY a JSON object. No prose, no markdown fences. Schema:

{"client": "<canonical client name or null>", "poc": "<POC first name or null>"}

If you cannot identify a field with confidence, set it to null. Do not guess.`;

export async function POST(request: NextRequest) {
  try {
    const { images: rawImages } = await request.json();

    const images: ImageInput[] = Array.isArray(rawImages)
      ? rawImages
          .filter((img: unknown): img is { mediaType: string; data: string } =>
            typeof img === 'object' &&
            img !== null &&
            typeof (img as { mediaType: unknown }).mediaType === 'string' &&
            typeof (img as { data: unknown }).data === 'string'
          )
          .filter((img) => ALLOWED_MEDIA_TYPES.includes(img.mediaType as ImageMediaType))
          .map((img) => ({
            mediaType: img.mediaType as ImageMediaType,
            data: img.data,
          }))
      : [];

    if (images.length === 0) {
      return NextResponse.json({ client: null, poc: null });
    }

    const clientRows = await sql`SELECT name FROM clients ORDER BY name`;
    const knownClientList = clientRows.rows
      .map((r) => `- ${r.name}`)
      .join('\n');

    const systemText = `${SYSTEM_PROMPT_HEAD}${knownClientList}${SYSTEM_PROMPT_TAIL}`;

    const content: Anthropic.ContentBlockParam[] = images.map((img) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
    }));
    content.push({
      type: 'text',
      text: 'Extract the client and POC from the screenshot(s) above.',
    });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system: [
        {
          type: 'text',
          text: systemText,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content }],
    });

    const block = response.content.find((b) => b.type === 'text');
    const text = block && block.type === 'text' ? block.text : '';

    let client_name: string | null = null;
    let poc: string | null = null;
    try {
      // Tolerant JSON extraction - sometimes the model wraps with backticks.
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as {
          client?: unknown;
          poc?: unknown;
        };
        if (typeof parsed.client === 'string' && parsed.client.trim()) {
          client_name = parsed.client.trim();
        }
        if (typeof parsed.poc === 'string' && parsed.poc.trim()) {
          poc = parsed.poc.trim();
        }
      }
    } catch {
      // Bad JSON, leave both null.
    }

    return NextResponse.json({ client: client_name, poc });
  } catch (error) {
    console.error('[detect-context] failed', error);
    return NextResponse.json({ client: null, poc: null }, { status: 200 });
  }
}
