import { NextRequest, NextResponse } from 'next/server';
import { askAIJacque, findClientByName, ImageInput, ImageMediaType } from '@/lib/ai-jacque';

const ALLOWED_MEDIA_TYPES: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const {
      question,
      conversationHistory,
      clientId: providedClientId,
      images: rawImages,
      askerName: rawAskerName,
      mode: rawMode,
    } = await request.json();
    const mode: 'guidance' | 'client_question' | 'pas' =
      rawMode === 'guidance'
        ? 'guidance'
        : rawMode === 'pas'
          ? 'pas'
          : 'client_question';
    const askerName: string | null =
      mode === 'guidance'
        ? null
        : typeof rawAskerName === 'string' && rawAskerName.trim()
          ? rawAskerName.trim()
          : null;

    const images: ImageInput[] = Array.isArray(rawImages)
      ? rawImages
          .filter((img: unknown): img is { mediaType: string; data: string } =>
            typeof img === 'object' && img !== null
              && typeof (img as { mediaType: unknown }).mediaType === 'string'
              && typeof (img as { data: unknown }).data === 'string'
          )
          .filter((img) => ALLOWED_MEDIA_TYPES.includes(img.mediaType as ImageMediaType))
          .map((img) => ({ mediaType: img.mediaType as ImageMediaType, data: img.data }))
      : [];

    if (!question && images.length === 0) {
      return NextResponse.json({ error: 'Missing question or image' }, { status: 400 });
    }

    const history = conversationHistory || '';

    // In Guidance mode the response is for the employee, not a client. Force
    // internal mode by skipping client inference + dropping the askerName.
    // Client Question and PAS both keep the client context.
    let clientId: number | null = null;
    if (mode === 'client_question' || mode === 'pas') {
      if (typeof providedClientId === 'number' && providedClientId > 0) {
        clientId = providedClientId;
      } else if (question) {
        clientId = await findClientByName(question, history);
      }
    }

    const result = await askAIJacque(
      clientId,
      question || '',
      history,
      images,
      askerName,
      mode
    );

    if ('error' in result) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
