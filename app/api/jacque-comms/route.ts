import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface UpsertBody {
  filename: string;
  content: string;
  client_id?: number | null;
  comm_date?: string | null;
  file_mtime?: string | null;
  content_hash?: string | null;
}

export async function GET() {
  try {
    const r = await sql`SELECT id, filename, client_id, comm_date, file_mtime, content_hash, created_at FROM jacque_comms ORDER BY created_at DESC LIMIT 200`;
    return NextResponse.json({ count: r.rows.length, rows: r.rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UpsertBody;
    if (!body.filename || !body.content) {
      return NextResponse.json({ error: 'filename and content required' }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO jacque_comms (filename, client_id, content, comm_date, file_mtime, content_hash)
      VALUES (
        ${body.filename},
        ${body.client_id ?? null},
        ${body.content},
        ${body.comm_date ?? null},
        ${body.file_mtime ?? null},
        ${body.content_hash ?? null}
      )
      ON CONFLICT (filename) DO UPDATE
        SET client_id = COALESCE(EXCLUDED.client_id, jacque_comms.client_id),
            content = EXCLUDED.content,
            comm_date = COALESCE(EXCLUDED.comm_date, jacque_comms.comm_date),
            file_mtime = COALESCE(EXCLUDED.file_mtime, jacque_comms.file_mtime),
            content_hash = COALESCE(EXCLUDED.content_hash, jacque_comms.content_hash)
      RETURNING id, filename, client_id, content_hash, comm_date
    `;

    return NextResponse.json({ ok: true, row: result.rows[0] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const filename = url.searchParams.get('filename');
    if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });
    const result = await sql`DELETE FROM jacque_comms WHERE filename = ${filename} RETURNING id`;
    return NextResponse.json({ ok: true, deleted: result.rows.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
