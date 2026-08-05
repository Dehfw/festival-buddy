import { after, NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { createGroup, getFestivalStatus, getUserById } from '@/lib/db';
import { notifyGroupCreated } from '@/lib/discord';

export const dynamic = 'force-dynamic';

/**
 * Gruppe erstellen: { name, festivalId }. Der Ersteller wird Owner und
 * erstes Mitglied; der Einladungscode wird generiert und steckt in der
 * Antwort (fürs "Lade Leute ein"-Sheet direkt nach dem Anlegen).
 */
export async function POST(req: Request) {
  const userId = readSessionUserId(req);
  const user = userId ? await getUserById(userId) : null;
  if (!userId || !user) {
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
  const festivalStatus = await getFestivalStatus(festivalId);
  if (festivalStatus === 'missing') {
    return NextResponse.json({ error: 'Unbekanntes Festival' }, { status: 400 });
  }
  if (festivalStatus === 'past') {
    return NextResponse.json(
      { error: 'Das Festival ist schon vorbei – dafür lässt sich keine Gruppe mehr gründen' },
      { status: 400 }
    );
  }

  const group = await createGroup(userId, name, festivalId);
  if (!group) {
    return NextResponse.json(
      { error: 'Gruppe konnte nicht angelegt werden – bitte nochmal versuchen' },
      { status: 500 }
    );
  }
  after(() => notifyGroupCreated(group.name, group.festivalName, user.name));
  return NextResponse.json({ group });
}
