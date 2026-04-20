import { sql } from '@vercel/postgres';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST() {
  try {
    const clients = await sql`SELECT id, name, crawled_content FROM clients WHERE crawled_content IS NOT NULL`;

    for (const c of clients.rows) {
      const summary = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: `Based on this website content, write a 2-3 sentence summary of the business. Focus on: what they do, who they serve, and their key differentiators.

Website content:
${c.crawled_content}

Write ONLY the summary, nothing else.`,
          },
        ],
      });

      const summaryText =
        summary.content[0].type === 'text' ? summary.content[0].text : '';

      await sql`UPDATE clients SET summary = ${summaryText} WHERE id = ${c.id}`;
      console.log(`Generated summary for ${c.name}`);
    }

    return Response.json({
      success: true,
      message: `Generated summaries for ${clients.rows.length} clients`,
    });
  } catch (error) {
    console.error('Summary generation error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
