import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const result = await sql`SELECT id, name, website_url, summary, last_crawled, ahrefs_project_id, ga4_property_id, google_ads_customer_id, COALESCE(pocs, ARRAY[]::TEXT[]) AS pocs FROM clients ORDER BY name`;
    return NextResponse.json(result.rows);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, website_url, ahrefs_project_id, ga4_property_id, google_ads_customer_id } = await request.json();

    const result = await sql`
      INSERT INTO clients (name, website_url, ahrefs_project_id, ga4_property_id, google_ads_customer_id)
      VALUES (${name}, ${website_url}, ${ahrefs_project_id ?? null}, ${ga4_property_id ?? null}, ${google_ads_customer_id ?? null})
      RETURNING id, name, website_url, ahrefs_project_id, ga4_property_id, google_ads_customer_id
    `;

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, ahrefs_project_id, ga4_property_id, google_ads_customer_id } = await request.json();
    if (typeof id !== 'number') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const result = await sql`
      UPDATE clients
      SET ahrefs_project_id = COALESCE(${ahrefs_project_id ?? null}, ahrefs_project_id),
          ga4_property_id = COALESCE(${ga4_property_id ?? null}, ga4_property_id),
          google_ads_customer_id = COALESCE(${google_ads_customer_id ?? null}, google_ads_customer_id)
      WHERE id = ${id}
      RETURNING id, name, website_url, ahrefs_project_id, ga4_property_id, google_ads_customer_id
    `;

    if (!result.rows.length) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
