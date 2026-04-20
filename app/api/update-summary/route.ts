import { sql } from '@vercel/postgres';

export async function POST(request: Request) {
  try {
    const { clientId, summary } = await request.json();

    await sql`UPDATE clients SET summary = ${summary} WHERE id = ${clientId}`;

    return Response.json({ success: true });
  } catch (error) {
    console.error('Update summary error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
