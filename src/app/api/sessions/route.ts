import { NextResponse } from 'next/server';
import { getCurrentSessionId, readSessionUserId } from '@/lib/auth';
import { listActiveSessions } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Eigene aktiven Sessions auflisten (z. B. um kopierte/vergessene Logins zu erkennen). */
export async function GET(req: Request) {
  const userId = await readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const currentId = getCurrentSessionId(req);
  const sessions = await listActiveSessions(userId);
  return NextResponse.json(
    { sessions: sessions.map((s) => ({ ...s, current: s.id === currentId })) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
