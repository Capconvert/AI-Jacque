import { NextRequest, NextResponse } from 'next/server';
import { askAIJacque } from '@/lib/ai-jacque';

export async function POST(request: NextRequest) {
  try {
    const { clientId, question } = await request.json();

    if (!clientId || !question) {
      return NextResponse.json({ error: 'Missing clientId or question' }, { status: 400 });
    }

    const result = await askAIJacque(clientId, question);

    if ('error' in result) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
