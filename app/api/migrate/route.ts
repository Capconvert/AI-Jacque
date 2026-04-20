import { sql } from '@vercel/postgres';

export async function POST() {
  try {
    // Add summary column if it doesn't exist
    await sql`
      ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS summary TEXT
    `;

    return Response.json({
      success: true,
      message: 'Database migrated successfully',
    });
  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
