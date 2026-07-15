import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { createGroup, festivalExists, getUserById } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Gruppe erstellen: { name, festivalId }. Der Ersteller wird Owner und
 * erstes Mitglied; der Einladungscode wird generiert und steckt in der
 * Antwort (fürs "Lade Leute ein"-Sheet direkt nach dem Anlegen).
 */
export async function POST(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId || !(await getUserById(userId))) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const festivalId = typeof body?.festivalId === 'string' ? body.festivalId : '';
  if (name.length < 2 || name.length > 40) {
    return NextResponse.json(
      { error: 'Gruppenname muss 2–40 Zeichen lang sein' },
      { status: 400 }
    );
  }
  if (!(await festivalExists(festivalId))) {
    return NextResponse.json({ error: 'Unbekanntes Festival' }, { status: 400 });
  }

  const group = await createGroup(userId, name, festivalId);
  if (!group) {
    return NextResponse.json(
      { error: 'Gruppe konnte nicht angelegt werden – bitte nochmal versuchen' },
      { status: 500 }
    );
  }
  return NextResponse.json({ group });
}
