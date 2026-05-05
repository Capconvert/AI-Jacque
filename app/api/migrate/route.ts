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

    await sql`CREATE TABLE IF NOT EXISTS jacque_comms (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      client_id INT REFERENCES clients(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      comm_date TIMESTAMP,
      file_mtime TIMESTAMP,
      content_hash VARCHAR(64),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
    await sql`CREATE INDEX IF NOT EXISTS jacque_comms_client_idx ON jacque_comms(client_id)`;
    await sql`CREATE INDEX IF NOT EXISTS jacque_comms_created_idx ON jacque_comms(created_at DESC)`;

    return Response.json({
      success: true,
      message: 'Database migrated successfully',
    });
  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
