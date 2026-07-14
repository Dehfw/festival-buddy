import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import { getGroupsForUser, getUserById } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Wer bin ich laut Session-Cookie – und in welchen Gruppen? 401 heißt:
 * keine (gültige) Session – der Client wirft dann seinen lokalen Nutzer
 * weg und zeigt den Passkey-Login. Die Gruppenliste steuert das Gate
 * (keine Gruppe -> GroupGate) und den Gruppen-Switcher.
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
  const groups = await getGroupsForUser(userId);
  return NextResponse.json({ user, groups });
}
