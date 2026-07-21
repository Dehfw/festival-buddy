import { NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { listSessionsForUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Eigene aktiven Sessions auflisten (siehe #36, Acceptance Criteria 6):
 * damit lässt sich erkennen, ob noch ein fremdes/altes Gerät angemeldet ist,
 * und es gezielt über DELETE /api/sessions/<id> abmelden.
 */
export async function GET(req: Request) {
  const session = await readSession(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Nicht eingeloggt' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const sessions = await listSessionsForUser(session.uid, session.sid);
  return NextResponse.json({ sessions }, { headers: { 'Cache-Control': 'no-store' } });
}
