import { NextRequest, NextResponse } from 'next/server';
import { askAIJacque, findClientByName } from '@/lib/ai-jacque';

export async function POST(request: NextRequest) {
  try {
    const { question } = await request.json();

    if (!question) {
      return NextResponse.json({ error: 'Missing question' }, { status: 400 });
    }

    const clientId = await findClientByName(question);
    if (!clientId) {
      return NextResponse.json({ error: 'Could not identify client from question. Please mention the client name.' }, { status: 400 });
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
