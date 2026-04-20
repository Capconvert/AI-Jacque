import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@vercel/postgres';
import { extractClientName } from './client-parser';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function findClientByName(question: string): Promise<number | null> {
  try {
    const clientName = extractClientName(question);
    if (!clientName) return null;

    const result = await sql`
      SELECT id FROM clients WHERE LOWER(name) LIKE LOWER(${'%' + clientName + '%'})
      LIMIT 1
    `;

    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    console.error('Client lookup error:', error);
    return null;
  }
}

const SYSTEM_PROMPT = `You are AI Jacque, a search marketing strategist answering client questions.

Your Voice:
- Write short declaratives. Target 8–15 words per sentence.
- Use Chain Logic: the last key term of one sentence opens the next. Build forward momentum.
- No hedging. Remove: maybe, might, perhaps, probably, could potentially, in my opinion.
- Bold load-bearing nouns only — the terms that carry the argument.
- Direct recommendations. Confident claims. Specific numbers.
- Lead with the point. No preamble.

Response Structure (PAS):
1. Problem: name it plainly.
2. Agitate: show what it costs. Numbers, examples, specifics.
3. Solve: the recommendation. Short, actionable.

Company Context:
We specialize in **Search & AI Engine Optimization**. Services: **SEO, GEO** (organic), **PPC Management** (paid), **AEO** (combined). Platforms: Google, ChatGPT, Bing, Amazon, DuckDuckGo, Brave, Yahoo, Claude, Perplexity, Gemini.

Always:
- Tie recommendations back to **visibility** and **revenue**.
- Be specific to the client's business.
- Avoid decorative language or humor in client-facing responses.
- When unsure about specifics, ask or admit the gap rather than inventing.`;

export async function askAIJacque(clientId: number, question: string) {
  try {
    // Get client info, summary, and crawled content
    const clientResult = await sql`
      SELECT id, name, website_url, summary, crawled_content FROM clients WHERE id = ${clientId}
    `;

    if (!clientResult.rows.length) {
      return { error: 'Client not found' };
    }

    const client_data = clientResult.rows[0];
    const clientContext = `
Client: ${client_data.name}
Website: ${client_data.website_url}

Client Summary:
${client_data.summary || 'No summary available'}

Detailed Website Content:
${client_data.crawled_content || 'No content crawled yet'}
    `;

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system: SYSTEM_PROMPT + '\n\n' + clientContext,
      messages: [
        {
          role: 'user',
          content: question,
        },
      ],
    });

    const answer = response.content[0].type === 'text' ? response.content[0].text : 'No response';

    // Store conversation
    await sql`
      INSERT INTO conversations (client_id, question, answer)
      VALUES (${clientId}, ${question}, ${answer})
    `;

    return { success: true, answer, client_name: client_data.name };
  } catch (error) {
    console.error('AI error:', error);
    return { error: String(error) };
  }
}
