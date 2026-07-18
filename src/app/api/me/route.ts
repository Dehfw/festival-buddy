import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getGroupsForUser, getUserById, updateUserColor } from '@/lib/db';
import { USER_COLORS } from '@/lib/ids';

export const dynamic = 'force-dynamic';

/**
 * Wer bin ich laut Session-Cookie – und in welchen Gruppen? 401 heißt:
 * keine (gültige) Session – der Client wirft dann seinen lokalen Nutzer
 * weg und zeigt den Passkey-Login. Die Gruppenliste steuert das Gate
 * (keine Gruppe -> GroupGate) und den Gruppen-Switcher.
 */
function noStore(body: unknown, init?: { status?: number }): NextResponse {
  const res = NextResponse.json(body, init);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function GET(req: Request) {
  const userId = await readSessionUserId(req);
  if (!userId) {
    return noStore({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const user = await getUserById(userId);
  if (!user) {
    return noStore({ error: 'Nutzer existiert nicht mehr' }, { status: 401 });
  }
  const groups = await getGroupsForUser(userId);
  return noStore({ user, groups });
}

/**
 * Eigenes Profil ändern – aktuell nur die Icon-/Avatar-Farbe. Die Farbe muss
 * aus der vorgegebenen Palette (USER_COLORS) stammen; freie Hex-Werte werden
 * abgelehnt, damit die Avatare überall gut lesbar bleiben.
 */
export async function PATCH(req: Request) {
  const userId = await readSessionUserId(req);
  if (!userId) {
    return noStore({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const color = typeof body?.color === 'string' ? body.color : '';
  if (!(USER_COLORS as readonly string[]).includes(color)) {
    return NextResponse.json({ error: 'Unbekannte Farbe' }, { status: 400 });
  }
  const user = await updateUserColor(userId, color);
  if (!user) {
    return noStore({ error: 'Nutzer existiert nicht mehr' }, { status: 401 });
  }
  return noStore({ user });
}
