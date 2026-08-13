import { NextResponse } from 'next/server';
import { getTimetable } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Öffentlicher Timetable eines Festivals für das Website-Embed (/embed und
 * public/embed.js). Enthält ausschließlich Festival-Daten (Tage, Bühnen,
 * Slots) – niemals Gruppen, Nutzer, Auswahlen oder Positionen.
 *
 * CORS ist bewusst offen: Die Daten sind öffentlich, so können Veranstalter
 * den Timetable auch direkt per fetch in eine eigene Integration ziehen.
 * Das CDN darf kurz cachen; das Embed pollt darüber alle 60 s Updates.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ festivalId: string }> }
) {
  const { festivalId } = await params;
  const timetable = await getTimetable(festivalId);
  if (!timetable) {
    return NextResponse.json(
      { error: 'Festival nicht gefunden' },
      { status: 404, headers: CORS_HEADERS }
    );
  }
  return NextResponse.json(
    { festivalId, timetable },
    {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
      },
    }
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
