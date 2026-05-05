import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    await sql`CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      website_url VARCHAR(500) NOT NULL,
      crawled_content TEXT,
      last_crawled TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    await sql`CREATE TABLE IF NOT EXISTS crawled_pages (
      id SERIAL PRIMARY KEY,
      client_id INT REFERENCES clients(id) ON DELETE CASCADE,
      url VARCHAR(500) NOT NULL,
      title VARCHAR(255),
      content TEXT,
      crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(client_id, url)
    )`;

    await sql`CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      client_id INT REFERENCES clients(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

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

    return NextResponse.json({ success: true, message: 'Database initialized' });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
