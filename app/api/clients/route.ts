import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const result = await sql`SELECT id, name, website_url, summary, last_crawled FROM clients ORDER BY name`;
    return NextResponse.json(result.rows);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, website_url } = await request.json();

    const result = await sql`
      INSERT INTO clients (name, website_url)
      VALUES (${name}, ${website_url})
      RETURNING id, name, website_url
    `;

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
