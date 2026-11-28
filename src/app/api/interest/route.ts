import { NextResponse } from 'next/server';
import { readSessionUserId } from '@/lib/auth';
import {
  getFirstGroupIdForUser,
  getGroupContextForUser,
  setBandInterest,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Band aus der Lineup-Ansicht merken: { group, slug, interested }.
 * Das Gegenstück zu /api/selection für die Zeit vor dem Timetable – die
 * Merkung hängt am Band-Slug statt an einer Slot-ID und übersteht
 * deshalb den späteren Import der Running Order.
 */
export async function POST(req: Request) {
  const userId = await readSessionUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: 'Nicht eingeloggt – bitte mit Passkey anmelden' },
      { status: 401 }
    );
  }
  const body = await req.json().catch(() => null);
  const slug = body?.slug;
  const interested = body?.interested;
  if (typeof slug !== 'string' || !slug || typeof interested !== 'boolean') {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }

  const groupId =
    typeof body?.group === 'string' && body.group
      ? body.group
      : await getFirstGroupIdForUser(userId);
  if (!groupId) {
    return NextResponse.json({ error: 'Noch in keiner Gruppe' }, { status: 403 });
  }
  const ctx = await getGroupContextForUser(groupId, userId);
  if (!ctx) {
    return NextResponse.json({ error: 'Kein Mitglied dieser Gruppe' }, { status: 403 });
  }
  // Ob es die Band gibt, entscheidet setBandInterest am Live-Stand des
  // Festivals (nicht am Cache) – und leitet einen inzwischen umbenannten
  // Namen auf die aktuelle Band um. Details dort.
  const result = await setBandInterest(userId, ctx.festivalId, slug, interested);
  if (result === 'unknown-band') {
    return NextResponse.json({ error: 'Unbekannte Band' }, { status: 404 });
  }
  if (result === 'unknown-user') {
    return NextResponse.json({ error: 'Unbekannter Nutzer' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
