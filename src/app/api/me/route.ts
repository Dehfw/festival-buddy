import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import {
  countOrganizerFestivals,
  getGroupsForUser,
  getPasswordEmailForUser,
  getUserById,
  updateUserProfile,
} from '@/lib/db';
import { USER_COLORS } from '@/lib/ids';

export const dynamic = 'force-dynamic';

/**
 * Wer bin ich laut Session-Cookie – und in welchen Gruppen? 401 heißt:
 * keine (gültige) Session – der Client wirft dann seinen lokalen Nutzer
 * weg und zeigt den Passkey-Login. Die Gruppenliste steuert das Gate
 * (keine Gruppe -> GroupGate) und den Gruppen-Switcher;
 * organizerFestivals (> 0) blendet den Veranstalter-Link in der Nav ein.
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
  const [groups, organizerFestivals, passwordEmail] = await Promise.all([
    getGroupsForUser(userId),
    countOrganizerFestivals(userId),
    getPasswordEmailForUser(userId),
  ]);
  // passwordEmail: hinterlegte Login-E-Mail (null = nur Passkey) – für den
  // Bereich "Login & Sicherheit" auf der Gruppen-Seite
  return NextResponse.json({ user, groups, organizerFestivals, passwordEmail });
}

/**
 * Eigenes Profil ändern – Anzeigename und/oder Icon-/Avatar-Farbe. Die Farbe
 * muss aus der vorgegebenen Palette (USER_COLORS) stammen; freie Hex-Werte
 * werden abgelehnt, damit die Avatare überall gut lesbar bleiben. Für den
 * Namen gelten dieselben Regeln wie bei der Registrierung (2–30 Zeichen);
 * er ist nur Anzeigename und hängt an keinem Login-Verfahren, darf sich
 * also frei ändern.
 */
export async function PATCH(req: Request) {
  const userId = readSessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const color =
    body?.color === undefined
      ? undefined
      : typeof body.color === 'string'
        ? body.color
        : '';
  const name =
    body?.name === undefined
      ? undefined
      : typeof body.name === 'string'
        ? body.name.trim()
        : '';
  if (color === undefined && name === undefined) {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }
  if (color !== undefined && !(USER_COLORS as readonly string[]).includes(color)) {
    return NextResponse.json({ error: 'Unbekannte Farbe' }, { status: 400 });
  }
  if (name !== undefined && (name.length < 2 || name.length > 30)) {
    return NextResponse.json(
      { error: 'Name muss 2–30 Zeichen lang sein' },
      { status: 400 }
    );
  }
  const user = await updateUserProfile(userId, { name, color });
  if (!user) {
    return NextResponse.json({ error: 'Nutzer existiert nicht mehr' }, { status: 401 });
  }
  return NextResponse.json({ user });
}
