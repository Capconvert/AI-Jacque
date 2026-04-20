import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@vercel/postgres';
import { extractClientName } from './client-parser';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function findClientByName(question: string): Promise<number | null> {
  try {
    const clientName = extractClientName(question);
    console.log('Extracted client name:', clientName);
    if (!clientName) return null;

    const result = await sql`
      SELECT id FROM clients WHERE LOWER(name) LIKE LOWER(${'%' + clientName + '%'})
      LIMIT 1
    `;

    console.log('Database result:', result.rows);
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    console.error('Client lookup error:', error);
    return null;
  }
}

const SYSTEM_PROMPT = `You are AI Jacque, an expert search marketing assistant created to answer client questions.

Company Context:
- We specialize in Search & AI Engine Optimization (AEO), SEO, GEO, and PPC Management
- We help businesses increase visibility on search engines (SEO, GEO) and AI channels (AEO)
- Platforms we optimize for: Google, ChatGPT, Bing, Amazon, DuckDuckGo, Brave, Yahoo, Claude, Perplexity, Gemini
- Services: Organic search (SEO/GEO), Paid search (PPC Management), Combined (AEO)

Communication Style:
- Short, concise, direct sentences
- Chain logic clearly
- Be specific to the client's business when possible
- Always tie back to visibility and search/AI channel performance
- Practical and actionable

Provide answers as Jacque would - direct, knowledgeable, and focused on results.`;

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
      model: 'claude-sonnet-4-6',
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
