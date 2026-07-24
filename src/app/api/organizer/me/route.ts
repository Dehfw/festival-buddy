import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getOrganizerFestivals } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Welche Festivals darf ich als Veranstalter pflegen? Leere Liste heißt:
 * eingeloggt, aber (noch) kein Veranstalter – die /veranstalter-Seite
 * zeigt dann nur das Code-Einlöse-Formular.
 */
export async function GET(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const festivals = await getOrganizerFestivals(userId);
  return NextResponse.json(
    { festivals },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
