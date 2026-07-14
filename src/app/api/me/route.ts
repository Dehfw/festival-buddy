import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getUserById } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Wer bin ich laut Session-Cookie? 401 heißt: keine (gültige) Session –
 * der Client wirft dann seinen lokalen Nutzer weg und zeigt den
 * Passkey-Login. So landen auch Alt-Clients aus der Nur-Name-Ära sauber
 * bei der Registrierung (die ihren Account per Namen übernimmt).
 */
export async function GET(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: 'Nutzer existiert nicht mehr' }, { status: 401 });
  }
  return NextResponse.json({ user });
}
