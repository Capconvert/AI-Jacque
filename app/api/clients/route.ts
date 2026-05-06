import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    let result;
    try {
      result = await sql`SELECT id, name, website_url, summary, last_crawled, ahrefs_project_id, ga4_property_id, google_ads_customer_id, COALESCE(pocs, ARRAY[]::TEXT[]) AS pocs FROM clients ORDER BY name`;
    } catch (innerError) {
      if (String(innerError).includes('column "pocs" does not exist')) {
        result = await sql`SELECT id, name, website_url, summary, last_crawled, ahrefs_project_id, ga4_property_id, google_ads_customer_id, ARRAY[]::TEXT[] AS pocs FROM clients ORDER BY name`;
      } else {
        throw innerError;
      }
    }
    return NextResponse.json(result.rows);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, website_url, ahrefs_project_id, ga4_property_id, google_ads_customer_id } = await request.json();
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const trimmedName = name.trim();
    const url = typeof website_url === 'string' && website_url.trim() ? website_url.trim() : '';

    const result = await sql`
      INSERT INTO clients (name, website_url, ahrefs_project_id, ga4_property_id, google_ads_customer_id)
      VALUES (${trimmedName}, ${url}, ${ahrefs_project_id ?? null}, ${ga4_property_id ?? null}, ${google_ads_customer_id ?? null})
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, website_url, ahrefs_project_id, ga4_property_id, google_ads_customer_id, COALESCE(pocs, ARRAY[]::TEXT[]) AS pocs
    `;

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ahrefs_project_id, ga4_property_id, google_ads_customer_id, add_poc } = body;
    if (typeof id !== 'number') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    if (typeof add_poc === 'string' && add_poc.trim()) {
      const trimmed = add_poc.trim();
      const result = await sql`
        UPDATE clients
        SET pocs = CASE
          WHEN ${trimmed} = ANY(COALESCE(pocs, ARRAY[]::TEXT[])) THEN pocs
          ELSE COALESCE(pocs, ARRAY[]::TEXT[]) || ARRAY[${trimmed}]::TEXT[]
        END
        WHERE id = ${id}
        RETURNING id, name, website_url, ahrefs_project_id, ga4_property_id, google_ads_customer_id, COALESCE(pocs, ARRAY[]::TEXT[]) AS pocs
      `;
      if (!result.rows.length) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }
      return NextResponse.json(result.rows[0]);
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
