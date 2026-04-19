import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { crawlWebsite } from '@/lib/crawler';

export async function POST(request: NextRequest) {
  try {
    const { clientId } = await request.json();

    const result = await sql`SELECT id, website_url FROM clients WHERE id = ${clientId}`;
    if (!result.rows.length) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const { id, website_url } = result.rows[0];
    const crawlResult = await crawlWebsite(id, website_url);

    return NextResponse.json(crawlResult);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Crawl all clients - for admin
export async function GET(request: NextRequest) {
  try {
    const clients = await sql`SELECT id, website_url FROM clients`;

    const results = [];
    for (const client of clients.rows) {
      const crawlResult = await crawlWebsite(client.id, client.website_url);
      results.push({ clientId: client.id, ...crawlResult });
    }

    return NextResponse.json({ success: true, results, total: results.length });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
