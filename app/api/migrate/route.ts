import { sql } from '@vercel/postgres';

export async function POST() {
  try {
    // Add summary column if it doesn't exist
    await sql`
      ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS summary TEXT
    `;

    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ahrefs_project_id INT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ga4_property_id VARCHAR(50)`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_ads_customer_id VARCHAR(20)`;

    return Response.json({
      success: true,
      message: 'Database migrated successfully',
    });
  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
